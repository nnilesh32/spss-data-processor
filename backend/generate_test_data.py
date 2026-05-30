import os
import pandas as pd
import numpy as np
import pyreadstat

def generate_sample_spss():
    np.random.seed(42)
    n_rows = 120
    
    # Generate random data
    data = {
        'ID': np.arange(1, n_rows + 1),
        'Gender': np.random.choice([1, 2], size=n_rows, p=[0.45, 0.55]),
        'AgeGroup': np.random.choice([1, 2, 3, 4], size=n_rows, p=[0.20, 0.40, 0.25, 0.15]),
        'Satisfaction': np.random.choice([1, 2, 3, 4, 5], size=n_rows, p=[0.05, 0.10, 0.25, 0.45, 0.15]),
        # Multi-response dichotomy set (Programming Languages checkbox)
        'Q1_1': np.random.choice([0, 1], size=n_rows, p=[0.3, 0.7]), # Python
        'Q1_2': np.random.choice([0, 1], size=n_rows, p=[0.4, 0.6]), # JavaScript
        'Q1_3': np.random.choice([0, 1], size=n_rows, p=[0.7, 0.3]), # R
        'Q1_4': np.random.choice([0, 1], size=n_rows, p=[0.5, 0.5]), # SQL
        'Q1_5': np.random.choice([0, 1], size=n_rows, p=[0.8, 0.2]), # C++
    }
    
    # Introduce some random NaNs (System Missing values)
    # E.g., Satisfaction has some missing answers
    satisfaction_na_indices = np.random.choice(n_rows, size=5, replace=False)
    data['Satisfaction'] = data['Satisfaction'].astype(float)
    data['Satisfaction'][satisfaction_na_indices] = np.nan
    
    df = pd.DataFrame(data)
    
    # Setup metadata
    column_labels = {
        'ID': 'Respondent ID',
        'Gender': 'Gender of Respondent',
        'AgeGroup': 'Age Category',
        'Satisfaction': 'Overall Satisfaction with Service',
        'Q1_1': 'Q1. Favorite Programming Languages [Python]',
        'Q1_2': 'Q1. Favorite Programming Languages [JavaScript]',
        'Q1_3': 'Q1. Favorite Programming Languages [R]',
        'Q1_4': 'Q1. Favorite Programming Languages [SQL]',
        'Q1_5': 'Q1. Favorite Programming Languages [C++]',
    }
    
    variable_value_labels = {
        'Gender': {1.0: 'Male', 2.0: 'Female'},
        'AgeGroup': {1.0: '18-24 years', 2.0: '25-34 years', 3.0: '35-44 years', 4.0: '45 years and older'},
        'Satisfaction': {
            1.0: 'Very Dissatisfied', 
            2.0: 'Dissatisfied', 
            3.0: 'Neutral', 
            4.0: 'Satisfied', 
            5.0: 'Very Satisfied'
        },
        'Q1_1': {0.0: 'No', 1.0: 'Yes'},
        'Q1_2': {0.0: 'No', 1.0: 'Yes'},
        'Q1_3': {0.0: 'No', 1.0: 'Yes'},
        'Q1_4': {0.0: 'No', 1.0: 'Yes'},
        'Q1_5': {0.0: 'No', 1.0: 'Yes'},
    }
    
    measure = {
        'ID': 'scale',
        'Gender': 'nominal',
        'AgeGroup': 'ordinal',
        'Satisfaction': 'ordinal',
        'Q1_1': 'nominal',
        'Q1_2': 'nominal',
        'Q1_3': 'nominal',
        'Q1_4': 'nominal',
        'Q1_5': 'nominal',
    }
    
    output_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sample_data.sav')
    
    print(f"Writing sample SPSS file to: {output_path}")
    pyreadstat.write_sav(
        df,
        output_path,
        column_labels=column_labels,
        variable_value_labels=variable_value_labels
    )
    print("Sample data generated successfully!")

if __name__ == '__main__':
    generate_sample_spss()
