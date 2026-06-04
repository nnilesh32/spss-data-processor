import os
import re
import pandas as pd
import pyreadstat

def parse_spss_file(file_path):
    """
    Parses an SPSS .sav file and returns the pandas DataFrame and metadata.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"SPSS file not found at: {file_path}")
    
    df, meta = pyreadstat.read_sav(file_path, user_missing=True)
    return df, meta

def extract_data_dictionary(df, meta):
    """
    Extracts variable metadata into a clean dictionary format suitable for UI display and export.
    """
    dictionary = []
    
    # Check measure mapping
    measures = getattr(meta, 'variable_measure', {}) or {}
    # type mappings
    types = getattr(meta, 'readstat_variable_types', {}) or {}
    # display formats
    formats = getattr(meta, 'original_variable_types', {}) or {}
    column_names_to_labels = getattr(meta, 'column_names_to_labels', {}) or {}
    variable_labels = getattr(meta, 'variable_labels', {}) or {}
    value_labels = getattr(meta, 'value_labels', {}) or {}
    variable_to_label = getattr(meta, 'variable_to_label', {}) or {}
    
    # SPSS grid specific mappings
    aligns = getattr(meta, 'variable_alignment', {}) or {}
    display_widths = getattr(meta, 'variable_display_width', {}) or {}
    missing_ranges = getattr(meta, 'missing_ranges', {}) or {}
    missing_user_values = getattr(meta, 'missing_user_values', {}) or {}
    
    for col in meta.column_names:
        label = column_names_to_labels.get(col) or variable_labels.get(col) or ""
        measure = measures.get(col) or "unknown"
        var_type_raw = types.get(col) or "unknown"
        var_format = formats.get(col) or ""
        
        # Determine SPSS Type
        if var_type_raw in ('double', 'float', 'integer', 'int16', 'int32', 'numeric'):
            var_type = "Numeric"
        elif var_type_raw in ('string', 'char', 'character'):
            var_type = "String"
        else:
            if var_format and var_format.upper().startswith('A'):
                var_type = "String"
            else:
                var_type = "Numeric"
                
        # Width & Decimals parsing
        width = 8
        decimals = 0
        if var_format:
            match = re.match(r'([A-Za-z]+)?([0-9]+)(?:\.([0-9]+))?', var_format)
            if match:
                w_val = match.group(2)
                d_val = match.group(3)
                if w_val:
                    width = int(w_val)
                if d_val:
                    decimals = int(d_val)
                    
        # Values preview format
        val_labels_dict = value_labels.get(variable_to_label.get(col) or col)
        if not val_labels_dict and col in value_labels:
            val_labels_dict = value_labels[col]
            
        # Clean value labels dict keys to prevent float keys (e.g. 1.0 -> 1)
        cleaned_val_labels_dict = {}
        val_labels_str = ""
        if val_labels_dict:
            parts = []
            for k, v in val_labels_dict.items():
                if isinstance(k, float) and k.is_integer():
                    k_str = str(int(k))
                    cleaned_val_labels_dict[int(k)] = v
                else:
                    k_str = str(k)
                    cleaned_val_labels_dict[k] = v
                parts.append(f"{k_str} = {v}")
            val_labels_str = "; ".join(parts)
            
        values_preview = "None"
        if cleaned_val_labels_dict:
            try:
                sorted_keys = sorted(cleaned_val_labels_dict.keys())
            except Exception:
                sorted_keys = list(cleaned_val_labels_dict.keys())
            if sorted_keys:
                first_key = sorted_keys[0]
                first_val = cleaned_val_labels_dict[first_key]
                if isinstance(first_key, float) and first_key.is_integer():
                    first_key_str = str(int(first_key))
                else:
                    first_key_str = str(first_key)
                values_preview = f"{{{first_key_str}, {first_val}}}..."
                
        # Missing values formatting
        missing_list = []
        ranges = missing_ranges.get(col, [])
        for r in ranges:
            lo = r.get('lo')
            hi = r.get('hi')
            if lo is not None and hi is not None:
                if lo == hi:
                    if isinstance(lo, float) and lo.is_integer():
                        missing_list.append(str(int(lo)))
                    else:
                        missing_list.append(str(lo))
                else:
                    lo_str = str(int(lo)) if isinstance(lo, float) and lo.is_integer() else str(lo)
                    hi_str = str(int(hi)) if isinstance(hi, float) and hi.is_integer() else str(hi)
                    missing_list.append(f"{lo_str}-{hi_str}")
                    
        user_vals = missing_user_values.get(col, [])
        if user_vals and not ranges:
            for val in user_vals:
                if isinstance(val, float) and val.is_integer():
                    missing_list.append(str(int(val)))
                else:
                    missing_list.append(str(val))
        missing_values = ", ".join(missing_list) if missing_list else "None"
        
        # Display width
        display_columns = display_widths.get(col) or 8
        
        # Alignment
        align_raw = (aligns.get(col) or "unknown").lower()
        if align_raw == "left":
            alignment = "Left"
        elif align_raw == "center":
            alignment = "Center"
        elif align_raw == "right":
            alignment = "Right"
        else:
            alignment = "Left" if var_type == "String" else "Right"
            
        # Measurement level
        measure_raw = measure.lower()
        if measure_raw == "nominal":
            measurement = "Nominal"
        elif measure_raw == "ordinal":
            measurement = "Ordinal"
        elif measure_raw == "scale":
            measurement = "Scale"
        else:
            measurement = "Nominal"
            
        dictionary.append({
            "variable_name": col,
            "variable_label": label,
            "measurement_level": measure,
            "type": var_type_raw,
            "format": var_format,
            "value_labels": val_labels_str,
            "value_labels_dict": cleaned_val_labels_dict,
            # New SPSS fields
            "spss_type": var_type,
            "width": width,
            "decimals": decimals,
            "values_preview": values_preview,
            "missing_values": missing_values,
            "display_columns": display_columns,
            "alignment": alignment,
            "measurement": measurement
        })
        
    return dictionary

def get_variable_stats(df, meta, var_name):
    """
    Computes frequency, valid percent, total percent, and cumulative percent for a single variable.
    """
    if var_name not in df.columns:
        raise ValueError(f"Variable '{var_name}' not found in dataset.")
        
    series = df[var_name]
    total_n = len(series)
    
    # Value labels
    value_labels = getattr(meta, 'value_labels', {}) or {}
    variable_to_label = getattr(meta, 'variable_to_label', {}) or {}
    column_names_to_labels = getattr(meta, 'column_names_to_labels', {}) or {}
    variable_labels = getattr(meta, 'variable_labels', {}) or {}
    
    val_labels_dict = value_labels.get(variable_to_label.get(var_name) or var_name)
    if not val_labels_dict and var_name in value_labels:
        val_labels_dict = value_labels[var_name]
    
    val_labels_dict = val_labels_dict or {}
    
    # Calculate counts including missing values
    counts = series.value_counts(dropna=False)
    
    # Build distribution table
    dist = []
    valid_n = series.dropna().count()
    
    # Sort values: standard sort, keep NaN at the bottom
    sorted_values = sorted([v for v in counts.index if pd.notna(v)])
    has_nan = any(pd.isna(v) for v in counts.index)
    
    cumulative_sum = 0.0
    
    for val in sorted_values:
        cnt = int(counts[val])
        label = val_labels_dict.get(val) or val_labels_dict.get(str(val)) or val_labels_dict.get(int(val) if isinstance(val, (int, float)) and val.is_integer() else val) or ""
        
        # Percents
        total_pct = (cnt / total_n) * 100.0 if total_n > 0 else 0.0
        valid_pct = (cnt / valid_n) * 100.0 if valid_n > 0 else 0.0
        cumulative_sum += valid_pct
        
        dist.append({
            "value": val,
            "label": str(label),
            "frequency": cnt,
            "percent": round(total_pct, 2),
            "valid_percent": round(valid_pct, 2),
            "cumulative_percent": round(cumulative_sum, 2),
            "is_missing": False
        })
        
    # Handle NaN
    if has_nan:
        # nan counts
        nan_keys = [k for k in counts.index if pd.isna(k)]
        nan_cnt = sum(int(counts[k]) for k in nan_keys)
        total_pct = (nan_cnt / total_n) * 100.0 if total_n > 0 else 0.0
        
        dist.append({
            "value": None,
            "label": "System Missing",
            "frequency": nan_cnt,
            "percent": round(total_pct, 2),
            "valid_percent": None,
            "cumulative_percent": None,
            "is_missing": True
        })
        
    return {
        "variable_name": var_name,
        "variable_label": column_names_to_labels.get(var_name) or variable_labels.get(var_name) or "",
        "total_cases": total_n,
        "valid_cases": int(valid_n),
        "missing_cases": int(total_n - valid_n),
        "distribution": dist
    }

def detect_checked_value(series, val_labels_dict):
    """
    Heuristically determines which value represents the 'checked' or 'selected' state in a checklist.
    """
    if val_labels_dict:
        # Check for standard positive labels
        positive_patterns = [r'^yes$', r'^checked$', r'^selected$', r'^agree$', r'^true$', r'^1$']
        for val, label in val_labels_dict.items():
            lbl_clean = str(label).strip().lower()
            if any(re.search(pat, lbl_clean) for pat in positive_patterns):
                return val
        
        # If any label matches, let's see if 1 is in keys
        if 1 in val_labels_dict:
            return 1
        if 1.0 in val_labels_dict:
            return 1.0
        if "1" in val_labels_dict:
            return "1"
            
    # Fallback to unique values
    unique_vals = set(series.dropna().unique())
    if len(unique_vals) <= 3:
        # If unique values are e.g., 0 and 1, 1 is checked
        if 1 in unique_vals:
            return 1
        if 1.0 in unique_vals:
            return 1.0
        if '1' in unique_vals:
            return '1'
        if 'Yes' in unique_vals:
            return 'Yes'
            
    # Default to 1
    return 1

def auto_detect_multi_response_groups(df, meta):
    """
    Finds groups of variables that likely belong to the same multi-response set based on:
    1. Common prefix in variable names (e.g., q4_1, q4_2, q4_3)
    2. Common prefix in variable labels (e.g., 'Q3: Apple', 'Q3: Orange')
    """
    columns = meta.column_names
    column_names_to_labels = getattr(meta, 'column_names_to_labels', {}) or {}
    variable_labels = getattr(meta, 'variable_labels', {}) or {}
    labels = {col: (column_names_to_labels.get(col) or variable_labels.get(col) or "") for col in columns}
    
    # 1. Grouping by name patterns: prefix + delimiter + number/letter
    name_groups = {}
    name_pattern = re.compile(r'^([a-zA-Z0-9]+)(?:_|-|r)?(\d+|[a-zA-Z])$')
    
    for col in columns:
        m = name_pattern.match(col)
        if m:
            prefix, suffix = m.groups()
            # Require prefix length > 1 to avoid grouping random variables
            if len(prefix) >= 2:
                if prefix not in name_groups:
                    name_groups[prefix] = []
                name_groups[prefix].append(col)
                
    # Filter name groups to keep only those with multiple variables
    name_groups = {k: v for k, v in name_groups.items() if len(v) > 1}
    
    # 2. Grouping by label patterns: common label prefix
    # E.g., "Q12. What features do you use? [Feature A]", "Q12. What features do you use? [Feature B]"
    label_groups = {}
    label_pattern = re.compile(r'^([^\[\(]+)[\(\[].*[\)\]]$') # text followed by bracketed text
    # Or text up to a colon/dash separator: "Q12: Option A", "Q12: Option B"
    separator_pattern = re.compile(r'^([^:\-\n]+)\s*[:\-]\s*.+$')
    
    for col in columns:
        lbl = labels[col]
        if not lbl:
            continue
            
        m1 = label_pattern.match(lbl)
        m2 = separator_pattern.match(lbl)
        
        prefix = None
        if m1:
            prefix = m1.group(1).strip()
        elif m2:
            prefix = m2.group(1).strip()
            
        if prefix and len(prefix) > 4: # ensure it's a descriptive prefix
            if prefix not in label_groups:
                label_groups[prefix] = []
            label_groups[prefix].append(col)
            
    # Filter label groups to keep only those with multiple variables
    label_groups = {k: v for k, v in label_groups.items() if len(v) > 1}
    
    # Merge and deduplicate groupings
    detected_groups = []
    seen_vars = set()
    
    # Process name groups first (usually more reliable coding-wise)
    for prefix, vars_list in sorted(name_groups.items()):
        # Check if they are of similar type and values
        # Add to groups
        group_id = f"group_{prefix.lower()}"
        
        # Find common label
        lbls = [labels[v] for v in vars_list if labels[v]]
        common_lbl = ""
        if lbls:
            # simple heuristic: find longest common starting substring
            common_lbl = os.path.commonprefix(lbls).strip()
            # Clean trailing punctuation
            common_lbl = re.sub(r'[\s:,\-\[\(]+$', '', common_lbl)
        if not common_lbl:
            common_lbl = f"Multi-Response Set: {prefix}"
            
        detected_groups.append({
            "group_id": group_id,
            "group_name": prefix.upper(),
            "group_label": common_lbl,
            "variables": vars_list,
            "detection_source": "name_pattern"
        })
        for v in vars_list:
            seen_vars.add(v)
            
    # Process label groups for variables not already captured
    for prefix, vars_list in sorted(label_groups.items()):
        # Filter out variables that were already grouped
        filtered_vars = [v for v in vars_list if v not in seen_vars]
        if len(filtered_vars) > 1:
            group_id = f"group_lbl_{re.sub(r'[^a-zA-Z0-9]', '_', prefix).lower()[:15]}"
            detected_groups.append({
                "group_id": group_id,
                "group_name": prefix[:10].upper().strip(),
                "group_label": prefix,
                "variables": filtered_vars,
                "detection_source": "label_pattern"
            })
            for v in filtered_vars:
                seen_vars.add(v)
                
    return detected_groups

def get_multi_response_stats(df, meta, variables, group_name, group_label, checked_value=None):
    """
    Computes frequency distribution for a group of multi-response variables.
    Frequencies represent the count of 'checked' values for each variable.
    Percentages are calculated based on both:
    1. Total responses (sum of all options selected)
    2. Total cases/respondents (number of respondents who answered at least one variable in the set)
    """
    valid_vars = [v for v in variables if v in df.columns]
    if not valid_vars:
        raise ValueError("None of the specified variables were found in the dataset.")
        
    # Analyze checked values and labels for each variable
    options_data = []
    
    # Identify respondents who answered at least one variable (non-null)
    # E.g., rows where at least one of the variables is not missing
    subset_df = df[valid_vars]
    respondents_mask = subset_df.notna().any(axis=1)
    total_valid_respondents = int(respondents_mask.sum())
    total_cases = len(df)
    
    total_selections = 0
    option_counts = {}
    
    # Determine the checked value for each variable (or use the provided one)
    for var in valid_vars:
        series = df[var]
        value_labels = getattr(meta, 'value_labels', {}) or {}
        variable_to_label = getattr(meta, 'variable_to_label', {}) or {}
        column_names_to_labels = getattr(meta, 'column_names_to_labels', {}) or {}
        variable_labels = getattr(meta, 'variable_labels', {}) or {}
        
        val_labels = value_labels.get(variable_to_label.get(var) or var) or value_labels.get(var) or {}
        
        var_checked_val = checked_value
        if var_checked_val is None:
            var_checked_val = detect_checked_value(series, val_labels)
            
        # Count checked values
        # Handle floating point equality issues if numerical
        if isinstance(var_checked_val, (int, float)):
            count = int(((series == var_checked_val) | (series == float(var_checked_val)) | (series == int(var_checked_val))).sum())
        else:
            count = int((series == var_checked_val).sum())
            
        # Try to extract the specific option label
        # e.g., if full label is "Q4. Fruits [Apple]", option label is "Apple"
        full_label = column_names_to_labels.get(var) or variable_labels.get(var) or var
        option_label = full_label
        
        # Match common brackets or brackets at the end
        m = re.search(r'\[(.*?)\]$', full_label)
        if m:
            option_label = m.group(1)
        else:
            m = re.search(r'\((.*?)\)$', full_label)
            if m:
                option_label = m.group(1)
            else:
                # Or look for parts after separator like : or -
                m = re.search(r'[:\-]\s*(.*?)$', full_label)
                if m and len(m.group(1)) > 1:
                    option_label = m.group(1)
                    
        option_counts[var] = {
            "variable_name": var,
            "option_label": option_label,
            "full_label": full_label,
            "frequency": count,
            "checked_value": var_checked_val
        }
        total_selections += count

    # Compile the final statistics table
    distribution = []
    for var in valid_vars:
        opt = option_counts[var]
        count = opt["frequency"]
        
        # Percent of responses: out of total clicks
        pct_responses = (count / total_selections * 100.0) if total_selections > 0 else 0.0
        # Percent of cases: out of total respondents who selected at least one option
        pct_cases = (count / total_valid_respondents * 100.0) if total_valid_respondents > 0 else 0.0
        
        distribution.append({
            "variable_name": var,
            "label": opt["option_label"],
            "full_label": opt["full_label"],
            "frequency": count,
            "percent_responses": round(pct_responses, 2),
            "percent_cases": round(pct_cases, 2),
            "checked_value": str(opt["checked_value"])
        })
        
    return {
        "group_name": group_name,
        "group_label": group_label,
        "total_cases": total_cases,
        "valid_respondents": total_valid_respondents,
        "total_responses": total_selections,
        "distribution": distribution
    }

def calculate_banner_crosstab(df, meta, row_var, col_vars):
    """
    Computes a banner crosstabulation between a row variable and multiple column variables.
    Provides overall totals (shown as the first column) and column proportion tests (Z-test)
    within each column variable group.
    """
    if row_var not in df.columns:
        raise ValueError(f"Row variable must exist in dataset: {row_var}")
        
    value_labels = getattr(meta, 'value_labels', {}) or {}
    variable_to_label = getattr(meta, 'variable_to_label', {}) or {}
    column_names_to_labels = getattr(meta, 'column_names_to_labels', {}) or {}
    variable_labels = getattr(meta, 'variable_labels', {}) or {}
    
    row_lbl_map = value_labels.get(variable_to_label.get(row_var) or row_var) or value_labels.get(row_var) or {}
    
    # Get all unique valid values for row variable, sorted
    row_series = df[row_var].dropna()
    row_values = sorted(row_series.unique())
    
    row_categories = []
    for r_val in row_values:
        lbl = row_lbl_map.get(r_val) or row_lbl_map.get(str(r_val)) or row_lbl_map.get(int(r_val) if isinstance(r_val, (int, float)) and r_val.is_integer() else r_val) or ""
        row_categories.append({"code": r_val, "label": str(lbl)})
        
    # Overall total column for row categories
    total_counts = []
    for r_val in row_values:
        total_counts.append(int((row_series == r_val).sum()))
    grand_total = int(sum(total_counts))
    
    # Total percentage list
    total_percents = []
    for cnt in total_counts:
        pct = (cnt / grand_total * 100.0) if grand_total > 0 else 0.0
        total_percents.append(round(pct, 2))
        
    # Track letter assignments A, B, C...
    letter_pool = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    letter_idx = 0
    
    columns_groups = []
    
    for col_var in col_vars:
        if col_var not in df.columns:
            continue
            
        col_lbl_map = value_labels.get(variable_to_label.get(col_var) or col_var) or value_labels.get(col_var) or {}
        
        # Valid subset for this column variable and row variable
        if row_var == col_var:
            subset = pd.DataFrame({
                "row_val": df[row_var],
                "col_val": df[col_var]
            }).dropna()
            row_col = "row_val"
            col_col = "col_val"
        else:
            subset = df[[row_var, col_var]].dropna()
            row_col = row_var
            col_col = col_var
            
        col_series = subset[col_col]
        
        col_values = sorted(col_series.unique())
        if not col_values:
            continue
            
        col_categories = []
        
        # Assign letters to columns in this group
        for c_val in col_values:
            lbl = col_lbl_map.get(c_val) or col_lbl_map.get(str(c_val)) or col_lbl_map.get(int(c_val) if isinstance(c_val, (int, float)) and c_val.is_integer() else c_val) or ""
            letter = letter_pool[letter_idx % len(letter_pool)]
            letter_idx += 1
            
            # Counts for this column category across all row categories
            counts = []
            for r_val in row_values:
                matches = ((subset[row_col] == r_val) & (subset[col_col] == c_val)).sum()
                counts.append(int(matches))
                
            col_total = int(sum(counts))
            
            # Percentages
            row_percents = [] # % of row total
            column_percents = [] # % of column total
            cell_total_percents = [] # % of grand total
            
            for idx, cnt in enumerate(counts):
                # row percent
                r_sum = total_counts[idx]
                r_pct = (cnt / r_sum * 100.0) if r_sum > 0 else 0.0
                row_percents.append(round(r_pct, 2))
                
                # column percent
                c_pct = (cnt / col_total * 100.0) if col_total > 0 else 0.0
                column_percents.append(round(c_pct, 2))
                
                # total percent
                t_pct = (cnt / grand_total * 100.0) if grand_total > 0 else 0.0
                cell_total_percents.append(round(t_pct, 2))
                
            col_categories.append({
                "code": str(c_val),
                "label": str(lbl),
                "letter": letter,
                "total": col_total,
                "counts": counts,
                "row_percents": row_percents,
                "column_percents": column_percents,
                "total_percents": cell_total_percents,
                "sig_markers": [""] * len(row_values)
            })
            
        # Perform Column Proportion Z-Test within this group
        num_cats = len(col_categories)
        for r_idx in range(len(row_values)):
            for i in range(num_cats):
                for j in range(num_cats):
                    if i == j:
                        continue
                    
                    cat1 = col_categories[i]
                    cat2 = col_categories[j]
                    
                    n1 = cat1["total"]
                    x1 = cat1["counts"][r_idx]
                    p1 = x1 / n1 if n1 > 0 else 0.0
                    
                    n2 = cat2["total"]
                    x2 = cat2["counts"][r_idx]
                    p2 = x2 / n2 if n2 > 0 else 0.0
                    
                    # Check Z-test criteria (pooled proportion)
                    if n1 >= 5 and n2 >= 5:
                        pooled_p = (x1 + x2) / (n1 + n2)
                        if 0.0 < pooled_p < 1.0:
                            se = ((pooled_p * (1.0 - pooled_p) * (1.0/n1 + 1.0/n2)) ** 0.5)
                            z = abs(p1 - p2) / se if se > 0 else 0.0
                            
                            # Significant at 95% confidence level (Z > 1.96)
                            if z > 1.96 and p1 > p2:
                                if cat2["letter"] not in cat1["sig_markers"][r_idx]:
                                    cat1["sig_markers"][r_idx] = (cat1["sig_markers"][r_idx] + " " + cat2["letter"]).strip()
                                    
        columns_groups.append({
            "variable_name": col_var,
            "variable_label": column_names_to_labels.get(col_var) or variable_labels.get(col_var) or col_var,
            "categories": col_categories
        })
        
    # Serialize row categories values as strings for json safety
    serialized_row_categories = []
    for r in row_categories:
        serialized_row_categories.append({
            "code": str(r["code"]),
            "label": r["label"]
        })
        
    return {
        "row_variable": row_var,
        "row_label": column_names_to_labels.get(row_var) or variable_labels.get(row_var) or row_var,
        "row_categories": serialized_row_categories,
        "total_column": {
            "counts": total_counts,
            "percents": total_percents,
            "total": grand_total
        },
        "columns_groups": columns_groups,
        "grand_total": grand_total,
        "valid_count": int(grand_total),
        "missing_count": int(len(df) - grand_total)
    }
