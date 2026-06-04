# SPSS Syntax Interpreter and Parser for Python Pandas
import re
import pandas as pd
import numpy as np

def split_spss_syntax(syntax_text):
    """
    Cleans up comments and splits SPSS syntax into separate statements using period ('.') boundaries,
    ensuring periods inside quotes are ignored.
    """
    lines = syntax_text.splitlines()
    clean_lines = []
    in_comment = False
    
    for line in lines:
        trimmed = line.strip()
        if not trimmed:
            continue
            
        if in_comment:
            if '.' in line:
                parts = line.split('.', 1)
                in_comment = False
                if parts[1].strip():
                    clean_lines.append(parts[1])
            continue
            
        # Comments start with * or COMMENT (case-insensitive) and terminate with a period
        if trimmed.startswith('*') or trimmed.upper().startswith('COMMENT'):
            if '.' in line:
                parts = line.split('.', 1)
                if parts[1].strip():
                    clean_lines.append(parts[1])
            else:
                in_comment = True
            continue
        
        # Discard end-of-line comments started with *
        if '*' in line:
            # Only remove if not inside quotes. For simplicity, ignore for now unless line starts with *
            pass
            
        clean_lines.append(line)
        
    full_text = "\n".join(clean_lines)
    
    statements = []
    current = []
    in_quote = False
    quote_char = None
    
    for char in full_text:
        if char in ("'", '"'):
            if not in_quote:
                in_quote = True
                quote_char = char
            elif char == quote_char:
                in_quote = False
                quote_char = None
        
        if char == '.' and not in_quote:
            statements.append("".join(current).strip())
            current = []
        else:
            current.append(char)
            
    rem = "".join(current).strip()
    if rem:
        statements.append(rem)
        
    return [s.strip() for s in statements if s.strip()]

def execute_spss_statement(statement, df, meta, variable_rename_map, label_rename_map, value_labels_map, missing_ranges_map, logs):
    """
    Executes a single parsed SPSS statement on the pandas DataFrame and re-maps metadata components in-place.
    """
    # Normalize command whitespaces
    stmt_clean = " ".join(statement.split())
    if not stmt_clean:
        return df, meta
        
    # Get the command verb
    tokens = stmt_clean.split(maxsplit=2)
    verb = tokens[0].upper()
    if len(tokens) > 1:
        verb_phrase = (tokens[0] + " " + tokens[1]).upper()
    else:
        verb_phrase = verb
        
    # 1. DELETE VARIABLES
    if verb_phrase.startswith("DELETE VARIABLES") or verb.startswith("DELETE"):
        # Expect format: DELETE VARIABLES var1 var2 ...
        content = stmt_clean
        if verb_phrase.startswith("DELETE VARIABLES"):
            content = stmt_clean[len("DELETE VARIABLES"):].strip()
        else:
            content = stmt_clean[len("DELETE"):].strip()
            if content.upper().startswith("VARIABLES"):
                content = content[len("VARIABLES"):].strip()
                
        vars_to_delete = [v.strip() for v in content.split() if v.strip()]
        existing_to_delete = [v for v in vars_to_delete if v in df.columns]
        
        if existing_to_delete:
            df.drop(columns=existing_to_delete, inplace=True)
            logs.append(f"Deleted variables: {', '.join(existing_to_delete)}")
        else:
            logs.append(f"Warning: None of the variables to delete ({', '.join(vars_to_delete)}) were found.")
            
    # 2. RENAME VARIABLES
    elif verb_phrase.startswith("RENAME VARIABLES") or verb.startswith("RENAME"):
        content = stmt_clean
        if verb_phrase.startswith("RENAME VARIABLES"):
            content = stmt_clean[len("RENAME VARIABLES"):].strip()
        else:
            content = stmt_clean[len("RENAME"):].strip()
            if content.upper().startswith("VARIABLES"):
                content = content[len("VARIABLES"):].strip()
                
        # Clean groupings: (old=new) (old2=new2) -> old=new old2=new2
        # Normalize spaces around '=' to handle (old = new)
        cleaned = content.replace("(", " ").replace(")", " ")
        cleaned = re.sub(r'\s*=\s*', '=', cleaned)
        rename_tokens = [t.strip() for t in cleaned.split() if t.strip()]
        
        step_rename_map = {}
        for r_tok in rename_tokens:
            if '=' in r_tok:
                p = r_tok.split('=')
                src = p[0].strip()
                dst = p[1].strip()
                if src in df.columns:
                    step_rename_map[src] = dst
                    variable_rename_map[src] = dst
                else:
                    logs.append(f"Warning: Cannot rename '{src}' to '{dst}', source variable not found.")
                    
        if step_rename_map:
            df.rename(columns=step_rename_map, inplace=True)
            logs.append(f"Renamed variables: " + ", ".join([f"{k} -> {v}" for k, v in step_rename_map.items()]))
            
    # 3. VARIABLE LABELS
    elif verb_phrase.startswith("VARIABLE LABELS") or verb.startswith("VARIABLE"):
        content = stmt_clean
        if verb_phrase.startswith("VARIABLE LABELS"):
            content = stmt_clean[len("VARIABLE LABELS"):].strip()
        else:
            content = stmt_clean[len("VARIABLE"):].strip()
            if content.upper().startswith("LABELS"):
                content = content[len("LABELS"):].strip()
                
        # Match groupings: varname "label string"
        # Handles single and double quotes
        pattern = r"([a-zA-Z0-9_]+)\s+(['\"])(.*?)\2"
        matches = re.findall(pattern, content)
        
        for var, quote, val in matches:
            # Target name might have been renamed in this script run
            resolved_var = variable_rename_map.get(var, var)
            if resolved_var in df.columns:
                label_rename_map[resolved_var] = val
                logs.append(f"Set label for '{resolved_var}' to '{val}'")
            else:
                logs.append(f"Warning: Cannot set label for '{var}', variable not found.")
                
    # 4. VALUE LABELS
    elif verb_phrase.startswith("VALUE LABELS") or verb.startswith("VALUE"):
        content = stmt_clean
        if verb_phrase.startswith("VALUE LABELS"):
            content = stmt_clean[len("VALUE LABELS"):].strip()
        else:
            content = stmt_clean[len("VALUE"):].strip()
            if content.upper().startswith("LABELS"):
                content = content[len("LABELS"):].strip()
                
        # Split on variable partitions `/`
        parts = content.split('/')
        for part in parts:
            part = part.strip()
            subtokens = part.split(maxsplit=1)
            if len(subtokens) < 2:
                continue
            raw_var = subtokens[0].strip()
            mapping_str = subtokens[1].strip()
            
            resolved_var = variable_rename_map.get(raw_var, raw_var)
            if resolved_var in df.columns:
                # Find number/string key followed by quoted text label
                pairs = re.findall(r"(\d+(?:\.\d+)?|['\"].*?['\"])\s+(['\"])(.*?)\2", mapping_str)
                val_map = {}
                for val_raw, quote, label in pairs:
                    val = val_raw.strip("'\"")
                    try:
                        if '.' in val:
                            val_val = float(val)
                            # if it represents integer, keep as int
                            if val_val.is_integer():
                                val_val = int(val_val)
                        else:
                            val_val = int(val)
                    except ValueError:
                        val_val = val
                    val_map[val_val] = label
                    
                value_labels_map[resolved_var] = val_map
                logs.append(f"Set value labels for '{resolved_var}': {len(val_map)} codes mapped.")
            else:
                logs.append(f"Warning: Cannot set value labels for '{raw_var}', variable not found.")
                
    # 5. COMPUTE
    elif verb.startswith("COMPUTE"):
        content = stmt_clean[len("COMPUTE"):].strip()
        parts = content.split('=', 1)
        if len(parts) == 2:
            target_var = parts[0].strip()
            raw_expr = parts[1].strip()
            
            # Resolve renames in expression
            expr = raw_expr
            # Sort keys by length descending to avoid matching substrings
            sorted_renames = sorted(variable_rename_map.items(), key=lambda x: len(x[0]), reverse=True)
            for old_name, new_name in sorted_renames:
                expr = re.sub(rf"\b{old_name}\b", new_name, expr)
                
            # Convert logical operators to python pandas eval syntax
            expr_eval = expr
            expr_eval = re.sub(r"\bAND\b", "&", expr_eval, flags=re.IGNORECASE)
            expr_eval = re.sub(r"\bOR\b", "|", expr_eval, flags=re.IGNORECASE)
            expr_eval = re.sub(r"\bNOT\b", "~", expr_eval, flags=re.IGNORECASE)
            expr_eval = expr_eval.replace("<>", "!=")
            
            # Map single "=" to "==" for logical test comparisons (not arithmetic calculations)
            # Find logical comparison "=" inside parenthesis or overall
            expr_eval = re.sub(r"(?<![<>=!])=(?!=)", "==", expr_eval)
            
            try:
                # Perform evaluation
                res_series = df.eval(expr_eval)
                
                # Check if boolean type, cast to integer codes matching SPSS numeric format
                if isinstance(res_series, pd.Series):
                    if res_series.dtype == 'bool':
                        df[target_var] = res_series.astype(int)
                    else:
                        df[target_var] = res_series
                else:
                    # scalar value
                    if isinstance(res_series, bool):
                        df[target_var] = int(res_series)
                    else:
                        df[target_var] = res_series
                        
                logs.append(f"Computed variable '{target_var}' = '{expr_eval}'")
            except Exception as e:
                # Fallback to simple evaluation or set scalar
                try:
                    # Handle basic numeric scalar assignment directly: e.g. COMPUTE flag = 1
                    val = float(expr_eval)
                    if val.is_integer():
                        val = int(val)
                    df[target_var] = val
                    logs.append(f"Computed variable '{target_var}' = {val}")
                except ValueError:
                    raise ValueError(f"Failed to evaluate COMPUTE expression '{raw_expr}': {str(e)}")
        else:
            raise ValueError(f"Invalid COMPUTE statement format: '{stmt_clean}'")
            
    # 6. MISSING VALUES
    elif verb_phrase.startswith("MISSING VALUES") or verb.startswith("MISSING"):
        content = stmt_clean
        if verb_phrase.startswith("MISSING VALUES"):
            content = stmt_clean[len("MISSING VALUES"):].strip()
        else:
            content = stmt_clean[len("MISSING"):].strip()
            if content.upper().startswith("VALUES"):
                content = content[len("VALUES"):].strip()
                
        parts = content.split('/')
        for part in parts:
            part = part.strip()
            m = re.match(r"([a-zA-Z0-9_]+)\s*\((.*?)\)", part)
            if m:
                raw_var = m.group(1).strip()
                vals_str = m.group(2).strip()
                
                resolved_var = variable_rename_map.get(raw_var, raw_var)
                if resolved_var in df.columns:
                    vals = [v.strip().strip("'\"") for v in vals_str.split(',') if v.strip()]
                    parsed_vals = []
                    for v in vals:
                        try:
                            if '.' in v:
                                parsed_vals.append(float(v))
                            else:
                                parsed_vals.append(int(v))
                        except ValueError:
                            parsed_vals.append(v)
                            
                    missing_ranges_map[resolved_var] = parsed_vals
                    logs.append(f"Set missing values for '{resolved_var}': {parsed_vals}")
                else:
                    logs.append(f"Warning: Cannot set missing values for '{raw_var}', variable not found.")
                    
    # 7. EXECUTE
    elif verb == "EXECUTE":
        logs.append("Executed statements pipeline.")
        
    else:
        # Unsupported commands
        logs.append(f"Warning: Command '{verb}' is not supported. Skipping statement.")
        
    return df, meta
