import os
import unittest
from spss_parser import (
    parse_spss_file,
    extract_data_dictionary,
    get_variable_stats,
    auto_detect_multi_response_groups,
    get_multi_response_stats,
    calculate_banner_crosstab
)

class TestSPSSParser(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        cls.file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sample_data.sav')
        if not os.path.exists(cls.file_path):
            raise FileNotFoundError("Make sure to run generate_test_data.py first to create the sample file.")
            
        cls.df, cls.meta = parse_spss_file(cls.file_path)

    def test_parse_file(self):
        self.assertEqual(len(self.df), 120)
        self.assertIn('Gender', self.df.columns)
        self.assertIn('Q1_1', self.df.columns)

    def test_extract_dictionary(self):
        dictionary = extract_data_dictionary(self.df, self.meta)
        self.assertEqual(len(dictionary), 9)
        gender_var = next(v for v in dictionary if v['variable_name'] == 'Gender')
        self.assertEqual(gender_var['variable_label'], 'Gender of Respondent')
        self.assertIn('1 = Male', gender_var['value_labels'])
        
        # Verify the new SPSS Variable View properties
        self.assertEqual(gender_var['spss_type'], 'Numeric')
        self.assertEqual(gender_var['width'], 8)
        self.assertEqual(gender_var['decimals'], 2)
        self.assertEqual(gender_var['values_preview'], '{1, Male}...')
        self.assertEqual(gender_var['missing_values'], 'None')
        self.assertEqual(gender_var['display_columns'], 8)
        self.assertEqual(gender_var['alignment'], 'Right')
        self.assertEqual(gender_var['measurement'], 'Nominal')

    def test_get_variable_stats(self):
        stats = get_variable_stats(self.df, self.meta, 'Satisfaction')
        self.assertEqual(stats['total_cases'], 120)
        # There are 5 missing values
        self.assertEqual(stats['missing_cases'], 5)
        self.assertEqual(stats['valid_cases'], 115)
        
        # Verify the sum of percentages
        dist = stats['distribution']
        valid_rows = [r for r in dist if not r['is_missing']]
        missing_rows = [r for r in dist if r['is_missing']]
        
        self.assertEqual(len(missing_rows), 1)
        self.assertEqual(missing_rows[0]['frequency'], 5)
        
        valid_percent_sum = sum(r['valid_percent'] for r in valid_rows)
        self.assertAlmostEqual(valid_percent_sum, 100.0, places=1)

    def test_auto_detect_multi_response_groups(self):
        groups = auto_detect_multi_response_groups(self.df, self.meta)
        # We should detect at least the Q1 group
        q1_groups = [g for g in groups if g['group_name'] == 'Q1']
        self.assertEqual(len(q1_groups), 1)
        q1_group = q1_groups[0]
        self.assertEqual(len(q1_group['variables']), 5)
        self.assertIn('Q1_1', q1_group['variables'])
        self.assertIn('Q1_5', q1_group['variables'])

    def test_get_multi_response_stats(self):
        variables = ['Q1_1', 'Q1_2', 'Q1_3', 'Q1_4', 'Q1_5']
        stats = get_multi_response_stats(
            self.df, 
            self.meta, 
            variables, 
            'Q1', 
            'Favorite Programming Languages'
        )
        self.assertEqual(stats['group_name'], 'Q1')
        self.assertEqual(stats['total_cases'], 120)
        
        # All columns are 0/1 without missing values in the test set
        # Valid respondents should be 120 because every row has 0 or 1
        self.assertEqual(stats['valid_respondents'], 120)
        
        # Frequencies counts
        dist = stats['distribution']
        self.assertEqual(len(dist), 5)
        
        # Check that percent of responses sum to 100%
        pct_res_sum = sum(row['percent_responses'] for row in dist)
        self.assertAlmostEqual(pct_res_sum, 100.0, places=1)

    def test_calculate_banner_crosstab(self):
        # Run a banner crosstab where row variable matches one of the column variables (test duplicate columns)
        ct_same = calculate_banner_crosstab(self.df, self.meta, 'Gender', ['Gender', 'Satisfaction'])
        self.assertEqual(len(ct_same['columns_groups']), 2)
        
        # Run a banner crosstab of Gender vs Satisfaction and AgeGroup
        ct = calculate_banner_crosstab(self.df, self.meta, 'Gender', ['Satisfaction', 'AgeGroup'])
        self.assertEqual(ct['row_variable'], 'Gender')
        self.assertEqual(len(ct['columns_groups']), 2)
        
        # Verify valid and missing counts
        self.assertEqual(ct['valid_count'], 120)
        self.assertEqual(ct['missing_count'], 0)
        self.assertEqual(ct['grand_total'], 120)
        
        # Verify total column counts sum to grand total
        self.assertEqual(sum(ct['total_column']['counts']), 120)
        
        # Verify columns_groups structures
        sat_group = next(g for g in ct['columns_groups'] if g['variable_name'] == 'Satisfaction')
        self.assertEqual(len(sat_group['categories']), 5)
        
        age_group = next(g for g in ct['columns_groups'] if g['variable_name'] == 'AgeGroup')
        self.assertEqual(len(age_group['categories']), 4)
        
        # Verify column letters are distinct
        all_letters = [cat['letter'] for g in ct['columns_groups'] for cat in g['categories']]
        self.assertEqual(len(all_letters), 9) # 5 satisfaction + 4 age
        self.assertEqual(len(set(all_letters)), 9) # All should be unique

if __name__ == '__main__':
    unittest.main()
