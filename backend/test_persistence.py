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

    def test_delete_variables(self):
        """Verify that variable deletion safely writes SAV file, updates DB, and saves presets."""
        import shutil
        from app import DeleteVariablesRequest
        
        # 1. Setup temporary SAV file copy
        temp_sav_dir = tempfile.mkdtemp()
        temp_sav_path = os.path.join(temp_sav_dir, "test_survey.sav")
        original_sav_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sample_data.sav')
        shutil.copyfile(original_sav_path, temp_sav_path)
        
        # 2. Insert project record in datasets table
        project_id = "test-delete-project-id"
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (project_id, "test_survey.sav", "2026-06-03T18:00:00", 120, 9, temp_sav_path))
        conn.commit()
        conn.close()
        
        # 3. Setup SESSION
        df, meta = app.parse_spss_file(temp_sav_path)
        app.SESSION["id"] = project_id
        app.SESSION["df"] = df
        app.SESSION["meta"] = meta
        app.SESSION["dictionary"] = app.extract_data_dictionary(df, meta)
        app.SESSION["file_path"] = temp_sav_path
        
        # Verify initial state
        self.assertIn("Gender", app.SESSION["df"].columns)
        self.assertEqual(len(app.SESSION["df"].columns), 9)
        
        # 4. Perform Deletion
        req = DeleteVariablesRequest(variables=["Gender"], preset_name="Test Preset")
        res = app.delete_variables(req)
        
        # 5. Assertions
        # Verify Session updated
        self.assertNotIn("Gender", app.SESSION["df"].columns)
        self.assertEqual(len(app.SESSION["df"].columns), 8)
        self.assertEqual(len(app.SESSION["dictionary"]), 8)
        
        # Verify Database updated for dataset
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT variable_count FROM datasets WHERE id = ?", (project_id,))
        var_count = cursor.fetchone()["variable_count"]
        self.assertEqual(var_count, 8)
        
        # Verify presets saved
        cursor.execute("SELECT * FROM deleted_variable_presets")
        preset = cursor.fetchone()
        self.assertIsNotNone(preset)
        self.assertEqual(preset["name"], "Test Preset")
        self.assertIn("Gender", json.loads(preset["variables"]))
        conn.close()
        
        # 6. Cleanup
        if os.path.exists(temp_sav_path):
            os.remove(temp_sav_path)
        shutil.rmtree(temp_sav_dir)
        app.SESSION["id"] = None
        app.SESSION["df"] = None
        app.SESSION["meta"] = None
        app.SESSION["dictionary"] = None
        app.SESSION["file_path"] = None

    def test_download_sav(self):
        import pandas as pd
        import pyreadstat
        import shutil
        
        # 1. Create a dummy dataset
        temp_sav_dir = tempfile.mkdtemp()
        temp_sav_path = os.path.join(temp_sav_dir, "dummy_download.sav")
        
        df = pd.DataFrame({"VarA": [1, 2], "VarB": ["X", "Y"]})
        pyreadstat.write_sav(df, temp_sav_path)
        
        # 2. Setup Session
        app.SESSION["file_path"] = temp_sav_path
        app.SESSION["original_filename"] = "dummy_download.sav"
        
        # 3. Request download
        res = app.download_sav_file()
        
        # 4. Assertions
        self.assertIsNotNone(res)
        self.assertEqual(res.path, temp_sav_path)
        self.assertEqual(res.filename, "dummy_download.sav")
        self.assertEqual(res.media_type, "application/x-spss-sav")
        
        # 5. Cleanup
        if os.path.exists(temp_sav_path):
            os.remove(temp_sav_path)
        shutil.rmtree(temp_sav_dir)
        app.SESSION["file_path"] = None
        app.SESSION["original_filename"] = None

    def test_project_scoped_presets(self):
        # 1. Setup two dummy datasets/projects in database
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path) VALUES (?, ?, ?, ?, ?, ?)",
                       ("proj-a", "file_a.sav", "2026-06-03T18:00:00", 100, 5, "/dummy/a.sav"))
        cursor.execute("INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path) VALUES (?, ?, ?, ?, ?, ?)",
                       ("proj-b", "file_b.sav", "2026-06-03T19:00:00", 100, 5, "/dummy/b.sav"))
        
        # 2. Insert presets for both projects
        cursor.execute("INSERT INTO deleted_variable_presets (id, dataset_id, name, variables, created_at) VALUES (?, ?, ?, ?, ?)",
                       ("preset-1", "proj-a", "Preset ProjA", '["Var1"]', "2026-06-03T18:10:00"))
        cursor.execute("INSERT INTO deleted_variable_presets (id, dataset_id, name, variables, created_at) VALUES (?, ?, ?, ?, ?)",
                       ("preset-2", "proj-b", "Preset ProjB", '["Var2"]', "2026-06-03T19:10:00"))
        conn.commit()
        conn.close()
        
        # 3. Test active project A session
        app.SESSION["id"] = "proj-a"
        presets_a = app.get_deletion_presets()
        self.assertEqual(len(presets_a), 1)
        self.assertEqual(presets_a[0]["id"], "preset-1")
        self.assertEqual(presets_a[0]["name"], "Preset ProjA")
        
        # 4. Test active project B session
        app.SESSION["id"] = "proj-b"
        presets_b = app.get_deletion_presets()
        self.assertEqual(len(presets_b), 1)
        self.assertEqual(presets_b[0]["id"], "preset-2")
        self.assertEqual(presets_b[0]["name"], "Preset ProjB")
        
        # Cleanup
        app.SESSION["id"] = None

    def test_delete_project(self):
        import shutil
        
        # 1. Create a dummy sav file
        temp_sav_dir = tempfile.mkdtemp()
        temp_sav_path = os.path.join(temp_sav_dir, "dummy_project_delete.sav")
        with open(temp_sav_path, "w") as f:
            f.write("dummy content")
            
        # 2. Setup datasets, groups, and presets in SQLite DB
        project_id = "delete-me-project"
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path) VALUES (?, ?, ?, ?, ?, ?)",
                       (project_id, "dummy_project_delete.sav", "2026-06-03T18:00:00", 10, 2, temp_sav_path))
        cursor.execute("INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, detection_source) VALUES (?, ?, ?, ?, ?, ?)",
                       (project_id, "grp-1", "Group1", "Group 1 Label", '["Var1"]', "manual"))
        cursor.execute("INSERT INTO deleted_variable_presets (id, dataset_id, name, variables, created_at) VALUES (?, ?, ?, ?, ?)",
                       ("preset-1", project_id, "Preset1", '["Var1"]', "2026-06-03T18:10:00"))
        conn.commit()
        conn.close()
        
        # 3. Request deletion
        app.SESSION["id"] = project_id
        res = app.delete_project(project_id)
        
        # 4. Assertions
        self.assertIsNotNone(res)
        self.assertEqual(res["message"], "Project deleted successfully.")
        
        # Check active session is reset
        self.assertIsNone(app.SESSION["id"])
        
        # Check database records are deleted (cascade)
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM datasets WHERE id = ?", (project_id,))
        self.assertIsNone(cursor.fetchone())
        cursor.execute("SELECT * FROM multi_response_groups WHERE dataset_id = ?", (project_id,))
        self.assertIsNone(cursor.fetchone())
        cursor.execute("SELECT * FROM deleted_variable_presets WHERE dataset_id = ?", (project_id,))
        self.assertIsNone(cursor.fetchone())
        conn.close()
        
        # Check file deleted from disk
        self.assertFalse(os.path.exists(temp_sav_path))
        
        # Cleanup
        if os.path.exists(temp_sav_path):
            os.remove(temp_sav_path)
        shutil.rmtree(temp_sav_dir)

    def test_rename_variables(self):
        """Verify that variable and label renaming operates correctly and updates SESSION / DB."""
        import shutil
        from app import RenameVariableRequest
        
        # 1. Setup temporary SAV file copy
        temp_sav_dir = tempfile.mkdtemp()
        temp_sav_path = os.path.join(temp_sav_dir, "test_survey_rename.sav")
        original_sav_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sample_data.sav')
        shutil.copyfile(original_sav_path, temp_sav_path)
        
        # 2. Insert project record and a multi-response group in SQLite DB
        project_id = "test-rename-project-id"
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (project_id, "test_survey_rename.sav", "2026-06-03T18:00:00", 120, 9, temp_sav_path))
        
        # Insert multi-response group containing Q1_1 and Q1_2
        cursor.execute("""
        INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (project_id, "grp-q1", "Q1_Group", "Q1 Multi-Response Group", '["Q1_1", "Q1_2"]', "1", "manual"))
        conn.commit()
        conn.close()
        
        # 3. Setup SESSION
        df, meta = app.parse_spss_file(temp_sav_path)
        app.SESSION["id"] = project_id
        app.SESSION["df"] = df
        app.SESSION["meta"] = meta
        app.SESSION["dictionary"] = app.extract_data_dictionary(df, meta)
        app.SESSION["file_path"] = temp_sav_path
        app.SESSION["multi_response_groups"] = {
            "grp-q1": {
                "group_id": "grp-q1",
                "group_name": "Q1_Group",
                "group_label": "Q1 Multi-Response Group",
                "variables": ["Q1_1", "Q1_2"],
                "checked_value": "1"
            }
        }
        
        # 4. Mode "single": Rename 'Gender' to 'gender_new' and update its label
        req_single = RenameVariableRequest(
            mode="single",
            variable="Gender",
            new_name="gender_new",
            new_label="New Gender Label"
        )
        res_single = app.rename_variables(req_single)
        self.assertEqual(res_single["message"], "Variables renamed successfully.")
        self.assertIn("gender_new", app.SESSION["df"].columns)
        self.assertNotIn("Gender", app.SESSION["df"].columns)
        
        gender_meta = next(v for v in app.SESSION["dictionary"] if v["variable_name"] == "gender_new")
        self.assertEqual(gender_meta["variable_label"], "New Gender Label")
        
        # 5. Mode "bulk_names": Rename 'Q1_1' to 'Q1_1_new'
        req_bulk_names = RenameVariableRequest(
            mode="bulk_names",
            renames={"Q1_1": "Q1_1_new"}
        )
        res_bulk = app.rename_variables(req_bulk_names)
        self.assertEqual(res_bulk["message"], "Variables renamed successfully.")
        self.assertIn("Q1_1_new", app.SESSION["df"].columns)
        self.assertNotIn("Q1_1", app.SESSION["df"].columns)
        
        # Verify the multi-response group updated cascade
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT variables FROM multi_response_groups WHERE dataset_id = ? AND group_id = ?", (project_id, "grp-q1"))
        grp_vars = json.loads(cursor.fetchone()["variables"])
        self.assertIn("Q1_1_new", grp_vars)
        self.assertNotIn("Q1_1", grp_vars)
        conn.close()
        
        # Verify session group is also updated
        self.assertIn("Q1_1_new", app.SESSION["multi_response_groups"]["grp-q1"]["variables"])
        self.assertNotIn("Q1_1", app.SESSION["multi_response_groups"]["grp-q1"]["variables"])
        
        # 6. Mode "bulk_labels": Update label of 'gender_new'
        req_bulk_labels = RenameVariableRequest(
            mode="bulk_labels",
            labels={"gender_new": "Updated Brand New Gender Label"}
        )
        res_labels = app.rename_variables(req_bulk_labels)
        self.assertEqual(res_labels["message"], "Variables renamed successfully.")
        gender_meta_updated = next(v for v in app.SESSION["dictionary"] if v["variable_name"] == "gender_new")
        self.assertEqual(gender_meta_updated["variable_label"], "Updated Brand New Gender Label")
        
        # 7. Cleanup
        if os.path.exists(temp_sav_path):
            os.remove(temp_sav_path)
        shutil.rmtree(temp_sav_dir)
        app.SESSION["id"] = None
        app.SESSION["df"] = None
        app.SESSION["meta"] = None
        app.SESSION["dictionary"] = None
        app.SESSION["file_path"] = None
        app.SESSION["multi_response_groups"] = {}

    def test_spss_syntax_execution(self):
        """Verify SPSS syntax execution endpoint parses commands, updates SAV file, cascades to DB and sets SESSION."""
        import shutil
        from app import ExecuteSyntaxRequest
        
        # 1. Setup temporary SAV file copy
        temp_sav_dir = tempfile.mkdtemp()
        temp_sav_path = os.path.join(temp_sav_dir, "test_survey_syntax.sav")
        original_sav_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sample_data.sav')
        shutil.copyfile(original_sav_path, temp_sav_path)
        
        # 2. Insert project record and a multi-response group in SQLite DB
        project_id = "test-syntax-project-id"
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO datasets (id, filename, upload_time, row_count, variable_count, file_path)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (project_id, "test_survey_syntax.sav", "2026-06-03T18:00:00", 120, 9, temp_sav_path))
        
        # Insert multi-response group containing Q1_1 and Q1_2
        cursor.execute("""
        INSERT INTO multi_response_groups (dataset_id, group_id, group_name, group_label, variables, checked_value, detection_source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (project_id, "grp-q1", "Q1_Group", "Q1 Multi-Response Group", '["Q1_1", "Q1_2"]', "1", "manual"))
        conn.commit()
        conn.close()
        
        # 3. Setup SESSION
        df, meta = app.parse_spss_file(temp_sav_path)
        app.SESSION["id"] = project_id
        app.SESSION["df"] = df
        app.SESSION["meta"] = meta
        app.SESSION["dictionary"] = app.extract_data_dictionary(df, meta)
        app.SESSION["file_path"] = temp_sav_path
        app.SESSION["multi_response_groups"] = {
            "grp-q1": {
                "group_id": "grp-q1",
                "group_name": "Q1_Group",
                "group_label": "Q1 Multi-Response Group",
                "variables": ["Q1_1", "Q1_2"],
                "checked_value": "1"
            }
        }
        
        # 4. Prepare SPSS syntax code block
        syntax_code = """
        * Delete Variable.
        DELETE VARIABLES Gender.
        
        * Rename Q1_1.
        RENAME VARIABLES (Q1_1 = Q1_1_new).
        
        * Set labels.
        VARIABLE LABELS Q1_1_new 'New Q1_1 Label'.
        VALUE LABELS Q1_1_new 1 'Checked' 0 'Unchecked'.
        
        * Compute a new variable.
        COMPUTE computed_var = 5.
        
        * Missing values.
        MISSING VALUES Q1_1_new (99).
        
        EXECUTE.
        """
        
        # 5. Execute Syntax via API endpoint
        req = ExecuteSyntaxRequest(syntax=syntax_code)
        res = app.execute_syntax(req)
        
        # 6. Assertions
        self.assertEqual(res["message"], "Syntax executed successfully.")
        
        # Assert Gender is deleted
        self.assertNotIn("Gender", app.SESSION["df"].columns)
        
        # Assert Q1_1 is renamed
        self.assertIn("Q1_1_new", app.SESSION["df"].columns)
        self.assertNotIn("Q1_1", app.SESSION["df"].columns)
        
        # Assert new labels are set
        dict_q1_new = next(v for v in app.SESSION["dictionary"] if v["variable_name"] == "Q1_1_new")
        self.assertEqual(dict_q1_new["variable_label"], "New Q1_1 Label")
        self.assertEqual(dict_q1_new["value_labels_dict"].get(1) or dict_q1_new["value_labels_dict"].get("1"), "Checked")
        self.assertEqual(dict_q1_new["value_labels_dict"].get(0) or dict_q1_new["value_labels_dict"].get("0"), "Unchecked")
        
        # Assert new variable computed
        self.assertIn("computed_var", app.SESSION["df"].columns)
        self.assertEqual(app.SESSION["df"]["computed_var"].iloc[0], 5)
        
        # Assert missing values set
        self.assertEqual(dict_q1_new["missing_values"], "99")
        
        # Assert multi response group updated cascade in DB
        conn = app.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT variables FROM multi_response_groups WHERE dataset_id = ? AND group_id = ?", (project_id, "grp-q1"))
        grp_vars = json.loads(cursor.fetchone()["variables"])
        self.assertIn("Q1_1_new", grp_vars)
        self.assertNotIn("Q1_1", grp_vars)
        conn.close()
        
        # 7. Cleanup
        if os.path.exists(temp_sav_path):
            os.remove(temp_sav_path)
        shutil.rmtree(temp_sav_dir)
        app.SESSION["id"] = None
        app.SESSION["df"] = None
        app.SESSION["meta"] = None
        app.SESSION["dictionary"] = None
        app.SESSION["file_path"] = None
        app.SESSION["multi_response_groups"] = {}

    def test_get_all_frequencies(self):
        """Verify get_all_frequencies endpoint calculates stats for all variables and multi-response groups."""
        # 1. Setup temporary SAV file
        temp_sav_dir = tempfile.mkdtemp()
        temp_sav_path = os.path.join(temp_sav_dir, "test_frequencies_all.sav")
        original_sav_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'sample_data.sav')
        import shutil
        shutil.copyfile(original_sav_path, temp_sav_path)
        
        # 2. Setup SESSION
        df, meta = app.parse_spss_file(temp_sav_path)
        app.SESSION["id"] = "test-freq-id"
        app.SESSION["df"] = df
        app.SESSION["meta"] = meta
        app.SESSION["dictionary"] = app.extract_data_dictionary(df, meta)
        app.SESSION["file_path"] = temp_sav_path
        app.SESSION["multi_response_groups"] = {
            "grp-q1": {
                "group_id": "grp-q1",
                "group_name": "Q1_Group",
                "group_label": "Q1 Multi-Response Group",
                "variables": ["Q1_1", "Q1_2"],
                "checked_value": "1"
            }
        }
        
        # 3. Call endpoint via app function
        res = app.get_all_frequencies()
        
        # 4. Assertions
        # Check that we received results for both groups and single variables
        self.assertGreater(len(res), 0)
        
        # Verify group stats
        group_res = next((item for item in res if item.get("is_group")), None)
        self.assertIsNotNone(group_res)
        self.assertEqual(group_res["group_id"], "grp-q1")
        self.assertEqual(group_res["group_name"], "Q1_Group")
        self.assertIn("distribution", group_res)
        
        # Verify single variable stats
        single_res = next((item for item in res if not item.get("is_group")), None)
        self.assertIsNotNone(single_res)
        self.assertIn("variable_name", single_res)
        self.assertIn("distribution", single_res)
        
        # 5. Cleanup
        if os.path.exists(temp_sav_path):
            os.remove(temp_sav_path)
        shutil.rmtree(temp_sav_dir)
        app.SESSION["id"] = None
        app.SESSION["df"] = None
        app.SESSION["meta"] = None
        app.SESSION["dictionary"] = None
        app.SESSION["file_path"] = None
        app.SESSION["multi_response_groups"] = {}

if __name__ == '__main__':
    unittest.main()

