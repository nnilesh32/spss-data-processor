import os
import unittest
import sqlite3
import json
import tempfile
import app  # Import app to access DB functions and schemas

class TestDatabasePersistence(unittest.TestCase):
    
    def setUp(self):
        # Create a temporary file for the database
        self.temp_db_fd, self.temp_db_path = tempfile.mkstemp()
        
        # Override DB_PATH in app module to point to the temporary test DB
        self.original_db_path = app.DB_PATH
        app.DB_PATH = self.temp_db_path
        
        # Initialize the database schema
        app.init_db()
        
    def tearDown(self):
        # Restore DB_PATH
        app.DB_PATH = self.original_db_path
        
        # Close file descriptor and remove the temporary DB file
        os.close(self.temp_db_fd)
        try:
            os.remove(self.temp_db_path)
        except OSError:
            pass

    def test_db_initialization(self):
        """Verify that tables are created with expected columns."""
        conn = app.get_db_connection()
        cursor = conn.cursor()
        
        # Check datasets table structure
        cursor.execute("PRAGMA table_info(datasets)")
        columns = {row['name']: row['type'] for row in cursor.fetchall()}
        self.assertIn('id', columns)
        self.assertIn('filename', columns)
        self.assertIn('upload_time', columns)
        self.assertIn('row_count', columns)
        self.assertIn('variable_count', columns)
        self.assertIn('file_path', columns)
        
        # Check multi_response_groups table structure
        cursor.execute("PRAGMA table_info(multi_response_groups)")
        groups_cols = {row['name']: row['type'] for row in cursor.fetchall()}
        self.assertIn('dataset_id', groups_cols)
        self.assertIn('group_id', groups_cols)
        self.assertIn('group_name', groups_cols)
        self.assertIn('group_label', groups_cols)
        self.assertIn('variables', groups_cols)
        self.assertIn('checked_value', groups_cols)
        self.assertIn('detection_source', groups_cols)
        
        conn.close()

    def test_insert_and_load_project(self):
        """Verify that insert and loading of project metadata and groups works correctly."""
        conn = app.get_db_connection()
        cursor = conn.cursor()
        
        project_id = "test-project-uuid-123"
        filename = "survey_2026.sav"
        upload_time = "2026-06-01T12:00:00"
        row_count = 500
        variable_count = 45
        file_path = "/path/to/test/survey_2026.sav"
        
        # 1. Insert dataset
        cursor.execute("""
        INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (project_id, filename, upload_time, row_count, variable_count, file_path))
        
        # 2. Insert multi response group
        group_id = "group_q1"
        group_name = "Q1_GROUP"
        group_label = "Q1 Favorite Sports"
        variables = ["q1_1", "q1_2", "q1_3"]
        checked_value = "1"
        detection_source = "user_defined"
        
        cursor.execute("""
        INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (project_id, group_id, group_name, group_label, json.dumps(variables), checked_value, detection_source))
        conn.commit()
        conn.close()
        
        # 3. Retrieve and verify
        conn = app.get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM datasets WHERE id = ?", (project_id,))
        dataset_row = cursor.fetchone()
        self.assertIsNotNone(dataset_row)
        self.assertEqual(dataset_row['filename'], filename)
        self.assertEqual(dataset_row['row_count'], row_count)
        
        cursor.execute("SELECT * FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
        group_rows = cursor.fetchall()
        self.assertEqual(len(group_rows), 1)
        self.assertEqual(group_rows[0]['group_name'], group_name)
        self.assertEqual(json.loads(group_rows[0]['variables']), variables)
        self.assertEqual(group_rows[0]['checked_value'], "1")
        
        conn.close()

    def test_checked_value_casting(self):
        """Verify that checked values of different types are correctly cast during load."""
        conn = app.get_db_connection()
        cursor = conn.cursor()
        
        project_id = "test-cast-project"
        cursor.execute("""
        INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
        VALUES (?, 'dummy.sav', 'now', 10, 5, 'dummy_path')
        """, (project_id,))
        
        # Test cases for checked values: database string -> expected python object
        test_cases = [
            ("1", 1),
            ("-5", -5),
            ("3.14", 3.14),
            ("-0.5", -0.5),
            ("Yes", "Yes"),
            (None, None)
        ]
        
        for idx, (db_val, expected_val) in enumerate(test_cases):
            group_id = f"group_{idx}"
            cursor.execute("""
            INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
            VALUES (?, ?, ?, 'Label', '[]', ?, 'user')
            """, (project_id, group_id, group_id, db_val))
            
        conn.commit()
        conn.close()
        
        # Load custom groups using app's logic (similar to app.py's load_project logic)
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
        groups_rows = cursor.fetchall()
        conn.close()
        
        loaded_vals = {}
        for row in groups_rows:
            checked_val = row["checked_value"]
            if checked_val is not None:
                try:
                    checked_val = int(checked_val)
                except ValueError:
                    try:
                        checked_val = float(checked_val)
                    except ValueError:
                        pass
            loaded_vals[row["group_id"]] = checked_val
            
        # Assert type-casted values match
        for idx, (_, expected_val) in enumerate(test_cases):
            group_id = f"group_{idx}"
            self.assertEqual(loaded_vals[group_id], expected_val)
            self.assertEqual(type(loaded_vals[group_id]), type(expected_val))

    def test_cascade_delete(self):
        """Verify that deleting a dataset cascade-deletes all its multi-response groups."""
        conn = app.get_db_connection()
        cursor = conn.cursor()
        
        project_id = "test-cascade-project"
        cursor.execute("""
        INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
        VALUES (?, 'cascade.sav', 'now', 10, 5, 'cascade_path')
        """, (project_id,))
        
        cursor.execute("""
        INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
        VALUES (?, 'g1', 'G1', 'L1', '[]', '1', 'user')
        """, (project_id,))
        
        conn.commit()
        
        # Verify group exists
        cursor.execute("SELECT COUNT(*) FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
        self.assertEqual(cursor.fetchone()[0], 1)
        
        # Delete dataset
        cursor.execute("DELETE FROM datasets WHERE id = ?", (project_id,))
        conn.commit()
        
        # Verify group is cascade-deleted
        cursor.execute("SELECT COUNT(*) FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
        self.assertEqual(cursor.fetchone()[0], 0)
        
        conn.close()

    def test_duplicate_upload_handling(self):
        """Verify that uploading a dataset with the same filename updates metadata instead of duplicating."""
        conn = app.get_db_connection()
        cursor = conn.cursor()
        
        filename = "duplicate_test.sav"
        
        # 1. Insert original dataset
        project_id_1 = "original-uuid"
        file_path = "/path/to/duplicate_test.sav"
        cursor.execute("""
        INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
        VALUES (?, ?, '2026-06-01T12:00:00', 100, 10, ?)
        """, (project_id_1, filename, file_path))
        
        # Insert a multi-response group for the first upload
        cursor.execute("""
        INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
        VALUES (?, 'group_old', 'OLD_GROUP', 'Old Label', '[]', '1', 'auto')
        """, (project_id_1,))
        conn.commit()
        
        # 2. Simulate re-upload of the same filename
        cursor.execute("SELECT id, file_path FROM datasets WHERE filename = ?", (filename,))
        existing_dataset = cursor.fetchone()
        self.assertIsNotNone(existing_dataset)
        
        project_id_2 = existing_dataset["id"]
        persistent_path = existing_dataset["file_path"]
        
        # Confirm it reuses the original UUID and path
        self.assertEqual(project_id_2, project_id_1)
        self.assertEqual(persistent_path, file_path)
        
        # Delete old multi-response groups for this dataset (simulating upload logic)
        cursor.execute("DELETE FROM multi_response_groups WHERE dataset_id = ?", (project_id_2,))
        
        # Update metadata (simulating upload logic)
        new_upload_time = "2026-06-01T13:00:00"
        cursor.execute("""
        UPDATE datasets 
        SET upload_time = ?, row_count = ?, variable_count = ?
        WHERE id = ?
        """, (new_upload_time, 200, 15, project_id_2))
        
        # Insert new multi-response groups
        cursor.execute("""
        INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
        VALUES (?, 'group_new', 'NEW_GROUP', 'New Label', '[]', '2', 'auto')
        """, (project_id_2,))
        conn.commit()
        conn.close()
        
        # 3. Retrieve and verify
        conn = app.get_db_connection()
        cursor = conn.cursor()
        
        # Confirm only ONE entry exists in datasets table for this filename
        cursor.execute("SELECT COUNT(*) FROM datasets WHERE filename = ?", (filename,))
        self.assertEqual(cursor.fetchone()[0], 1)
        
        # Confirm metadata was updated correctly
        cursor.execute("SELECT row_count, variable_count, upload_time FROM datasets WHERE id = ?", (project_id_1,))
        row = cursor.fetchone()
        self.assertEqual(row['row_count'], 200)
        self.assertEqual(row['variable_count'], 15)
        self.assertEqual(row['upload_time'], new_upload_time)
        
        # Confirm old group is gone and new group is stored
        cursor.execute("SELECT group_id, group_name FROM multi_response_groups WHERE dataset_id = ?", (project_id_1,))
        groups = cursor.fetchall()
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['group_id'], 'group_new')
        self.assertEqual(groups[0]['group_name'], 'NEW_GROUP')
        
        conn.close()

    def test_cleanup_duplicate_datasets(self):
        """Verify that duplicate datasets are cleaned up on startup, keeping only the latest and deleting older files."""
        # 1. Create dummy files on disk
        fd1, file_path1 = tempfile.mkstemp(suffix=".sav")
        fd2, file_path2 = tempfile.mkstemp(suffix=".sav")
        os.close(fd1)
        os.close(fd2)
        
        try:
            filename = "cleanup_test.sav"
            conn = app.get_db_connection()
            cursor = conn.cursor()
            
            # Older entry
            cursor.execute("""
            INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
            VALUES ('old-id', ?, '2026-06-01T12:00:00', 100, 10, ?)
            """, (filename, file_path1))
            
            # Newer entry
            cursor.execute("""
            INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
            VALUES ('new-id', ?, '2026-06-01T13:00:00', 150, 12, ?)
            """, (filename, file_path2))
            
            # Insert a multi response group for the old one to test cascade deletion
            cursor.execute("""
            INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
            VALUES ('old-id', 'g_old', 'OLD', 'Old', '[]', '1', 'user')
            """)
            
            conn.commit()
            conn.close()
            
            # Verify they exist
            self.assertTrue(os.path.exists(file_path1))
            self.assertTrue(os.path.exists(file_path2))
            
            # Run cleanup
            app.cleanup_duplicate_datasets()
            
            # 2. Verify DB state
            conn = app.get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("SELECT id, upload_time, file_path FROM datasets WHERE filename = ?", (filename,))
            rows = cursor.fetchall()
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["id"], "new-id")
            self.assertEqual(rows[0]["file_path"], file_path2)
            
            # Verify old group is cascade-deleted
            cursor.execute("SELECT COUNT(*) FROM multi_response_groups WHERE dataset_id = 'old-id'")
            self.assertEqual(cursor.fetchone()[0], 0)
            
            conn.close()
            
            # 3. Verify files on disk
            self.assertFalse(os.path.exists(file_path1))
            self.assertTrue(os.path.exists(file_path2))
            
        finally:
            # Cleanup disk files
            for p in (file_path1, file_path2):
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except OSError:
                        pass

    def test_get_data_view(self):
        """Verify that the get_data_view endpoint paginates and filters correctly."""
        import pandas as pd
        # Mock SESSION
        app.SESSION["df"] = pd.DataFrame({
            "col1": range(150),
            "col2": ["val" + str(i) for i in range(150)]
        })
        
        # Test page 1
        res1 = app.get_data_view(page=1, page_size=100)
        self.assertEqual(res1["page"], 1)
        self.assertEqual(res1["page_size"], 100)
        self.assertEqual(res1["total_cases"], 150)
        self.assertEqual(len(res1["data"]), 100)
        self.assertEqual(res1["columns"], ["col1", "col2"])
        self.assertEqual(res1["data"][0]["col1"], 0)
        self.assertEqual(res1["data"][99]["col1"], 99)
        
        # Test page 2
        res2 = app.get_data_view(page=2, page_size=100)
        self.assertEqual(res2["page"], 2)
        self.assertEqual(len(res2["data"]), 50)
        self.assertEqual(res2["data"][0]["col1"], 100)
        self.assertEqual(res2["data"][49]["col1"], 149)
        
        # Test filtering
        import json
        res_filter = app.get_data_view(page=1, page_size=100, filters=json.dumps({"col2": "val10"}))
        self.assertEqual(res_filter["total_cases"], 11) # val10, val100-val109
        self.assertEqual(res_filter["data"][0]["col2"], "val10")
        
        # Test list-based allowed values checklist filtering
        res_list = app.get_data_view(page=1, page_size=100, filters=json.dumps({"col2": ["val0", "val1", "val2"]}))
        self.assertEqual(res_list["total_cases"], 3)
        self.assertEqual(res_list["data"][0]["col2"], "val0")
        
        # Test unique values endpoint
        res_vals = app.get_column_unique_values(column="col2")
        self.assertEqual(res_vals["column"], "col2")
        self.assertEqual(len(res_vals["values"]), 150)
        self.assertEqual(res_vals["values"][0]["value"], "val0")
        
        # Clean up
        app.SESSION["df"] = None

    def test_export_data_view(self):
        """Verify that the export_data_view endpoint successfully generates an Excel file."""
        import pandas as pd
        # Mock SESSION
        app.SESSION["df"] = pd.DataFrame({
            "col1": [1.0, 2.0, 3.0],
            "col2": ["val1", "val2", "val3"]
        })
        class MockMeta:
            value_labels = {"col1": {1.0: "Label 1", 2.0: "Label 2", 3.0: "Label 3"}}
            variable_to_label = {}
        app.SESSION["meta"] = MockMeta()
        
        # Test without value labels mapping
        res = app.export_data_view(value_labels=False)
        self.assertIsNotNone(res)
        self.assertEqual(res.media_type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertTrue(os.path.exists(res.path))
        os.remove(res.path) # Cleanup
        
        # Clean up
        app.SESSION["df"] = None
        app.SESSION["meta"] = None

if __name__ == '__main__':
    unittest.main()

