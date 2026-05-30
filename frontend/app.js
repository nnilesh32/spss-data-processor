// SPSS Online Data Processor Frontend Controller

// Application State
const state = {
    filename: null,
    rowCount: 0,
    variableCount: 0,
    variables: [], // All variables metadata
    multiResponseGroups: [], // Multi-response groups
    selectedVar: null, // Selected variable name (single) or group_id (multi)
    isSelectedGroup: false, // True if the selection is a group
    chartInstance: null, // ChartJS instance
    chartMetric: 'frequency', // 'frequency' or 'percent'
    currentData: null, // Cache of the selected variable/group stats
    crosstabResults: null // Cache of generated crosstab results
};

// DOM Elements
const el = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('file-input'),
    loader: document.getElementById('loader'),
    dashboardContainer: document.getElementById('dashboard-container'),
    uploadOverlay: document.getElementById('upload-overlay'),
    sidebar: document.getElementById('sidebar'),
    mainContent: document.getElementById('main-content'),
    noSelectionPlaceholder: document.getElementById('no-selection-placeholder'),
    workspaceLayout: document.getElementById('workspace-layout'),
    
    // Header Actions
    headerActions: document.getElementById('header-actions'),
    activeFilename: document.getElementById('active-filename'),
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnExportExcel: document.getElementById('btn-export-excel'),
    btnToggleTheme: document.getElementById('btn-toggle-theme'),
    themeIcon: document.getElementById('theme-icon'),
    
    // Lists
    searchInput: document.getElementById('search-input'),
    countGroups: document.getElementById('count-groups'),
    countVariables: document.getElementById('count-variables'),
    multiResponseList: document.getElementById('multi-response-list'),
    singleVariablesList: document.getElementById('single-variables-list'),
    mrVariablesSelectList: document.getElementById('mr-variables-select-list'),
    
    // Tabs
    tabBtnFrequency: document.getElementById('tab-btn-frequency'),
    tabBtnCrosstab: document.getElementById('tab-btn-crosstab'),
    tabPaneFrequency: document.getElementById('tab-pane-frequency'),
    tabPaneCrosstab: document.getElementById('tab-pane-crosstab'),
    
    // Variable Detail View
    displayVarTitle: document.getElementById('display-var-title'),
    statsTable: document.getElementById('stats-table'),
    distributionChart: document.getElementById('distribution-chart'),
    chartMetricToggle: document.getElementById('chart-metric-toggle'),
    toggleFreqBtn: document.getElementById('toggle-freq-btn'),
    togglePctBtn: document.getElementById('toggle-pct-btn'),
    
    // CrossTab Configurator
    crosstabRowVars: document.getElementById('crosstab-row-vars'),
    crosstabColVars: document.getElementById('crosstab-col-vars'),
    crosstabRowSelectAll: document.getElementById('crosstab-row-select-all'),
    crosstabRowClearAll: document.getElementById('crosstab-row-clear-all'),
    crosstabColSelectAll: document.getElementById('crosstab-col-select-all'),
    crosstabColClearAll: document.getElementById('crosstab-col-clear-all'),
    crosstabPercentageSelect: document.getElementById('crosstab-percentage-select'),
    btnGenerateCrosstab: document.getElementById('btn-generate-crosstab'),
    crosstabResults: document.getElementById('crosstab-results'),
    
    // Attributes Card
    attributesCard: document.getElementById('attributes-card'),
    attrName: document.getElementById('attr-name'),
    attrLevel: document.getElementById('attr-level'),
    attrType: document.getElementById('attr-type'),
    attrFormat: document.getElementById('attr-format'),
    attrLabel: document.getElementById('attr-label'),
    groupActions: document.getElementById('group-actions'),
    btnDeleteGroup: document.getElementById('btn-delete-group'),
    
    // Collapsible Value Labels
    valLabelsCollapsible: document.getElementById('value-labels-collapsible'),
    valLabelsToggle: document.getElementById('value-labels-toggle'),
    valLabelsContent: document.getElementById('value-labels-content'),
    valLabelsList: document.getElementById('value-labels-list'),
    
    // Multi-Response Builder Form
    mrName: document.getElementById('mr-name'),
    mrLabel: document.getElementById('mr-label'),
    mrCheckedValue: document.getElementById('mr-checked-value'),
    btnCreateGroup: document.getElementById('btn-create-group'),
    
    // Modal
    modalBackdrop: document.getElementById('modal-backdrop'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    btnModalClose: document.getElementById('btn-modal-close')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    try {
        loadSavedTheme();
        setupEventListeners();
        lucide.createIcons();
    } catch (err) {
        console.error("Startup Error:", err);
        alert("Startup Error: " + err.message + "\nStack: " + err.stack);
    }
});

// Setup Events
function setupEventListeners() {
    // File Upload Click
    el.dropzone.addEventListener('click', () => el.fileInput.click());
    
    // File Input Change
    el.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
    
    // Drag & Drop
    ['dragenter', 'dragover'].forEach(eventName => {
        el.dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            el.dropzone.classList.add('dragover');
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        el.dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            el.dropzone.classList.remove('dragover');
        }, false);
    });
    
    el.dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleFileUpload(files[0]);
        }
    });
    
    // Variable Search
    el.searchInput.addEventListener('input', (e) => {
        filterVariableLists(e.target.value);
    });
    
    // Collapsible Toggle for Value Labels
    el.valLabelsToggle.addEventListener('click', () => {
        el.valLabelsContent.classList.toggle('open');
        const icon = el.valLabelsToggle.querySelector('i');
        if (el.valLabelsContent.classList.contains('open')) {
            icon.setAttribute('data-lucide', 'chevron-up');
        } else {
            icon.setAttribute('data-lucide', 'chevron-down');
        }
        lucide.createIcons();
    });
    
    // Custom Multi-Response Group Creation
    el.btnCreateGroup.addEventListener('click', createCustomMultiResponseGroup);
    
    // Delete custom group
    el.btnDeleteGroup.addEventListener('click', deleteSelectedMultiResponseGroup);
    
    // Export Data Dictionary Excel
    el.btnExportExcel.addEventListener('click', () => triggerExport('excel'));
    
    // Export Data Dictionary CSV
    el.btnExportCsv.addEventListener('click', () => triggerExport('csv'));
    
    // Modal Dismiss
    el.btnModalClose.addEventListener('click', hideModal);

    // Theme Switcher Button
    el.btnToggleTheme.addEventListener('click', toggleTheme);

    // Chart Metric Toggles
    el.toggleFreqBtn.addEventListener('click', () => setChartMetric('frequency'));
    el.togglePctBtn.addEventListener('click', () => setChartMetric('percent'));

    // Tabs Clicking
    el.tabBtnFrequency.addEventListener('click', () => switchTab('frequency'));
    el.tabBtnCrosstab.addEventListener('click', () => switchTab('crosstab'));

    // Crosstab Select All/None
    el.crosstabRowSelectAll.addEventListener('click', () => toggleCheckboxes('#crosstab-row-vars', true));
    el.crosstabRowClearAll.addEventListener('click', () => toggleCheckboxes('#crosstab-row-vars', false));
    el.crosstabColSelectAll.addEventListener('click', () => toggleCheckboxes('#crosstab-col-vars', true));
    el.crosstabColClearAll.addEventListener('click', () => toggleCheckboxes('#crosstab-col-vars', false));

    // Crosstab Generation Click
    el.btnGenerateCrosstab.addEventListener('click', generateCrosstabs);

    // Crosstab Cell Display option change (re-render current tables)
    el.crosstabPercentageSelect.addEventListener('change', () => {
        if (state.crosstabResults) renderCrosstabResults();
    });
}

// Theme Management
function loadSavedTheme() {
    const savedTheme = localStorage.getItem('spss-theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        el.themeIcon.setAttribute('data-lucide', 'sun');
    } else {
        document.body.classList.remove('light-theme');
        el.themeIcon.setAttribute('data-lucide', 'moon');
    }
}

function toggleTheme() {
    const body = document.body;
    body.classList.toggle('light-theme');
    
    if (body.classList.contains('light-theme')) {
        localStorage.setItem('spss-theme', 'light');
        el.themeIcon.setAttribute('data-lucide', 'sun');
    } else {
        localStorage.setItem('spss-theme', 'dark');
        el.themeIcon.setAttribute('data-lucide', 'moon');
    }
    lucide.createIcons();
    
    // Refresh the chart if one is currently visible to update grid/label colors
    if (state.currentData) {
        refreshCurrentChart();
    }
}

// Tabs Navigation
function switchTab(tabName) {
    const rightPane = document.getElementById('workspace-right-pane');
    if (tabName === 'frequency') {
        el.tabBtnFrequency.classList.add('active');
        el.tabBtnCrosstab.classList.remove('active');
        el.tabPaneFrequency.style.display = 'flex';
        el.tabPaneCrosstab.style.display = 'none';
        if (el.workspaceLayout) {
            el.workspaceLayout.style.gridTemplateColumns = '';
        }
        if (rightPane) {
            rightPane.style.display = '';
        }
    } else {
        el.tabBtnFrequency.classList.remove('active');
        el.tabBtnCrosstab.classList.add('active');
        el.tabPaneFrequency.style.display = 'none';
        el.tabPaneCrosstab.style.display = 'flex';
        if (el.workspaceLayout) {
            el.workspaceLayout.style.gridTemplateColumns = '1fr';
        }
        if (rightPane) {
            rightPane.style.display = 'none';
        }
    }
}
window.switchTab = switchTab;

// Helper to select all or clear checkboxes
function toggleCheckboxes(containerSelector, checked) {
    const list = document.querySelector(containerSelector);
    if (list) {
        list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checked);
    }
}

// Modal Helpers
function showModal(title, message) {
    el.modalTitle.textContent = title;
    el.modalMessage.textContent = message;
    el.modalBackdrop.classList.add('active');
}

function hideModal() {
    el.modalBackdrop.classList.remove('active');
}

// Chart Metric Management
function setChartMetric(metric) {
    if (state.chartMetric === metric) return;
    
    state.chartMetric = metric;
    
    // Update button states
    if (metric === 'frequency') {
        el.toggleFreqBtn.classList.add('active');
        el.togglePctBtn.classList.remove('active');
    } else {
        el.toggleFreqBtn.classList.remove('active');
        el.togglePctBtn.classList.add('active');
    }
    
    // Refresh visual representation
    if (state.currentData) {
        refreshCurrentChart();
    }
}

// Refresh active chart based on cached data, selected variable type, and active metric
function refreshCurrentChart() {
    if (!state.currentData) return;
    
    if (state.isSelectedGroup) {
        const chartLabels = state.currentData.distribution.map(row => row.label);
        
        let chartData, labelText;
        if (state.chartMetric === 'frequency') {
            chartData = state.currentData.distribution.map(row => row.frequency);
            labelText = 'Frequency Count';
        } else {
            chartData = state.currentData.distribution.map(row => row.percent_cases);
            labelText = '% of Respondents (Cases)';
        }
        
        renderChart(chartLabels, chartData, labelText, 'horizontal');
    } else {
        const chartLabels = state.currentData.distribution
            .filter(row => !row.is_missing)
            .map(row => row.label ? `${row.value} (${row.label})` : row.value);
            
        let chartData, labelText;
        if (state.chartMetric === 'frequency') {
            chartData = state.currentData.distribution
                .filter(row => !row.is_missing)
                .map(row => row.frequency);
            labelText = 'Frequency Count';
        } else {
            chartData = state.currentData.distribution
                .filter(row => !row.is_missing)
                .map(row => row.valid_percent || 0.0);
            labelText = 'Valid Percent (%)';
        }
            
        renderChart(chartLabels, chartData, labelText, 'vertical');
    }
}

// File Upload Handler
async function handleFileUpload(file) {
    if (!file.name.endsWith('.sav')) {
        showModal('Invalid File Type', 'Please upload a valid SPSS data file (.sav).');
        return;
    }
    
    // Update UI for Loading State
    el.dropzone.style.display = 'none';
    el.loader.style.display = 'flex';
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to parse SPSS file');
        }
        
        const data = await response.json();
        
        // Update App State
        state.filename = data.filename;
        state.rowCount = data.row_count;
        state.variableCount = data.variable_count;
        state.variables = data.variables;
        state.multiResponseGroups = data.suggested_groups;
        state.selectedVar = null;
        state.isSelectedGroup = false;
        state.currentData = null;
        state.crosstabResults = null;
        
        // Update UI Dashboard view
        el.activeFilename.textContent = state.filename;
        el.countVariables.textContent = state.variables.length;
        el.countGroups.textContent = state.multiResponseGroups.length;
        
        // Populate Tree lists & Builder forms
        renderVariableLists();
        populateMultiResponseBuilderCheckboxes();
        populateCrosstabBuilders();
        
        // Switch view states
        el.uploadOverlay.style.display = 'none';
        el.headerActions.style.display = 'flex';
        el.sidebar.style.display = 'flex';
        el.mainContent.style.display = 'flex';
        el.noSelectionPlaceholder.style.display = 'flex';
        el.workspaceLayout.style.display = 'none';
        switchTab('frequency'); // Reset tab view
        
    } catch (e) {
        showModal('Processing Error', e.message);
        // Reset view
        el.dropzone.style.display = 'flex';
        el.loader.style.display = 'none';
    }
}

// Render Left Sidebar Lists
function renderVariableLists() {
    // 1. Render Multi-Response List
    el.multiResponseList.innerHTML = '';
    state.multiResponseGroups.forEach(group => {
        const li = document.createElement('li');
        li.className = 'variable-item';
        li.dataset.id = group.group_id;
        li.dataset.type = 'group';
        li.innerHTML = `
            <i data-lucide="layers" class="var-icon"></i>
            <div class="var-info">
                <span class="var-name" title="${group.group_name}">${group.group_name}</span>
                <span class="var-label" title="${group.group_label}">${group.group_label}</span>
            </div>
        `;
        li.addEventListener('click', () => selectVariableOrGroup(group.group_id, true));
        el.multiResponseList.appendChild(li);
    });
    el.countGroups.textContent = state.multiResponseGroups.length;
    
    // 2. Render Single Variables List
    el.singleVariablesList.innerHTML = '';
    state.variables.forEach(v => {
        const li = document.createElement('li');
        li.className = 'variable-item';
        li.dataset.id = v.variable_name;
        li.dataset.type = 'single';
        li.innerHTML = `
            <i data-lucide="database" class="var-icon"></i>
            <div class="var-info">
                <span class="var-name" title="${v.variable_name}">${v.variable_name}</span>
                <span class="var-label" title="${v.variable_label}">${v.variable_label}</span>
            </div>
        `;
        li.addEventListener('click', () => selectVariableOrGroup(v.variable_name, false));
        el.singleVariablesList.appendChild(li);
    });
    el.countVariables.textContent = state.variables.length;
    
    lucide.createIcons();
}

// Populate multi-response configurator checkboxes
function populateMultiResponseBuilderCheckboxes() {
    el.mrVariablesSelectList.innerHTML = '';
    state.variables.forEach(v => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `
            <input type="checkbox" value="${v.variable_name}">
            <span style="font-family: monospace; font-weight: bold; color: var(--accent-cyan); margin-right: 0.25rem;">${v.variable_name}</span>
            <span style="color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 200px;">${v.variable_label}</span>
        `;
        el.mrVariablesSelectList.appendChild(label);
    });
}

// Populate Crosstab Configurator checklist columns
function populateCrosstabBuilders() {
    el.crosstabRowVars.innerHTML = '';
    el.crosstabColVars.innerHTML = '';
    
    state.variables.forEach(v => {
        // Create Row Box
        const rowLabel = document.createElement('label');
        rowLabel.className = 'checkbox-item';
        rowLabel.innerHTML = `
            <input type="checkbox" value="${v.variable_name}">
            <span style="font-family: monospace; font-weight: bold; color: var(--accent-cyan); margin-right: 0.25rem;">${v.variable_name}</span>
            <span style="color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 140px;">${v.variable_label}</span>
        `;
        el.crosstabRowVars.appendChild(rowLabel);

        // Create Column Box
        const colLabel = document.createElement('label');
        colLabel.className = 'checkbox-item';
        colLabel.innerHTML = `
            <input type="checkbox" value="${v.variable_name}">
            <span style="font-family: monospace; font-weight: bold; color: var(--accent-cyan); margin-right: 0.25rem;">${v.variable_name}</span>
            <span style="color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden; max-width: 140px;">${v.variable_label}</span>
        `;
        el.crosstabColVars.appendChild(colLabel);
    });
}

// Variable Search Filtering
function filterVariableLists(query) {
    const q = query.trim().toLowerCase();
    
    // Filter Single Variables
    const singleItems = el.singleVariablesList.querySelectorAll('.variable-item');
    singleItems.forEach(item => {
        const name = item.querySelector('.var-name').textContent.toLowerCase();
        const label = item.querySelector('.var-label').textContent.toLowerCase();
        if (name.includes(q) || label.includes(q)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
    
    // Filter Multi Groups
    const groupItems = el.multiResponseList.querySelectorAll('.variable-item');
    groupItems.forEach(item => {
        const name = item.querySelector('.var-name').textContent.toLowerCase();
        const label = item.querySelector('.var-label').textContent.toLowerCase();
        if (name.includes(q) || label.includes(q)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Select a variable / group from the list
async function selectVariableOrGroup(id, isGroup) {
    // Reset active states
    document.querySelectorAll('.variable-item').forEach(item => item.classList.remove('active'));
    
    // Find active element
    const listToSearch = isGroup ? el.multiResponseList : el.singleVariablesList;
    const activeItem = listToSearch.querySelector(`.variable-item[data-id="${id}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
    
    state.selectedVar = id;
    state.isSelectedGroup = isGroup;
    
    // Hide placeholder and show workspace layout
    el.noSelectionPlaceholder.style.display = 'none';
    el.workspaceLayout.style.display = 'grid';
    
    // Automatically reset active tab to Frequency when a variable is clicked
    switchTab('frequency');
    
    // Fetch details
    if (isGroup) {
        await loadMultiResponseGroupDetails(id);
    } else {
        await loadSingleVariableDetails(id);
    }
}

// Load Details for Single Variable
async function loadSingleVariableDetails(varName) {
    try {
        const response = await fetch(`/api/variable/${varName}`);
        if (!response.ok) throw new Error('Failed to retrieve variable stats.');
        const data = await response.json();
        
        // Cache data
        state.currentData = data;
        
        // Update Titles
        el.displayVarTitle.innerHTML = `<span class="card-title-left"><i data-lucide="table"></i> Frequency Table: ${data.variable_name}</span>`;
        
        // Build Table
        el.statsTable.innerHTML = `
            <thead>
                <tr>
                    <th>Value</th>
                    <th>Value Label</th>
                    <th>Frequency</th>
                    <th>Percent</th>
                    <th>Valid Percent</th>
                    <th>Cumulative %</th>
                </tr>
            </thead>
            <tbody>
                ${data.distribution.map(row => `
                    <tr class="${row.is_missing ? 'total-row' : ''}" style="${row.is_missing ? 'color: var(--text-muted);' : ''}">
                        <td style="font-family: monospace; font-weight: bold;">${row.value === null ? 'Missing' : row.value}</td>
                        <td>${row.label || ''}</td>
                        <td>${row.frequency.toLocaleString()}</td>
                        <td>${row.percent}%</td>
                        <td>${row.valid_percent !== null ? row.valid_percent + '%' : '-'}</td>
                        <td>${row.cumulative_percent !== null ? row.cumulative_percent + '%' : '-'}</td>
                    </tr>
                `).join('')}
                <tr class="total-row">
                    <td>Total</td>
                    <td>Valid Cases</td>
                    <td>${data.valid_cases.toLocaleString()}</td>
                    <td>${((data.valid_cases / data.total_cases) * 100).toFixed(1)}%</td>
                    <td>100%</td>
                    <td>-</td>
                </tr>
                <tr class="total-row">
                    <td>Total</td>
                    <td>Overall Sample</td>
                    <td>${data.total_cases.toLocaleString()}</td>
                    <td>100%</td>
                    <td>-</td>
                    <td>-</td>
                </tr>
            </tbody>
        `;
        
        // Update Attributes Card
        el.attrName.textContent = data.variable_name;
        el.attrLevel.textContent = data.measurement_level;
        el.attrType.textContent = data.type;
        el.attrFormat.textContent = data.format;
        el.attrLabel.value = data.variable_label;
        el.groupActions.style.display = 'none';
        
        // Populate Collapsible value labels
        el.valLabelsCollapsible.style.display = 'block';
        el.valLabelsList.innerHTML = '';
        
        const labelsMap = data.value_labels || {};
        const entries = Object.entries(labelsMap);
        if (entries.length > 0) {
            entries.forEach(([val, label]) => {
                const div = document.createElement('div');
                div.className = 'val-label-row';
                div.innerHTML = `<span class="val-label-code">${val}</span><span class="val-label-text">${label}</span>`;
                el.valLabelsList.appendChild(div);
            });
        } else {
            el.valLabelsList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem; padding: 0.35rem 0;">No value labels mapped for this variable.</div>';
        }
        
        // Reset collapsible height
        if (el.valLabelsContent.classList.contains('open')) {
            el.valLabelsContent.classList.remove('open');
            el.valLabelsToggle.querySelector('i').setAttribute('data-lucide', 'chevron-down');
        }
        
        // Render Chart
        refreshCurrentChart();
        
    } catch (e) {
        showModal('Error Loading Variable', e.message);
    }
    lucide.createIcons();
}

// Load Details for Multi-Response Group
async function loadMultiResponseGroupDetails(groupId) {
    try {
        const response = await fetch(`/api/multi-response/group/${groupId}`);
        if (!response.ok) throw new Error('Failed to retrieve multi-response group stats.');
        const data = await response.json();
        
        // Cache data
        state.currentData = data;
        
        // Update Title
        el.displayVarTitle.innerHTML = `<span class="card-title-left"><i data-lucide="layers"></i> Multi-Response Table: ${data.group_name}</span>`;
        
        // Build Table
        el.statsTable.innerHTML = `
            <thead>
                <tr>
                    <th>Variable</th>
                    <th>Option Label</th>
                    <th>Frequencies (Checked)</th>
                    <th>% of Selections</th>
                    <th>% of Respondents (Cases)</th>
                </tr>
            </thead>
            <tbody>
                ${data.distribution.map(row => `
                    <tr>
                        <td style="font-family: monospace; font-weight: bold; color: var(--accent-cyan);">${row.variable_name}</td>
                        <td>${row.label}</td>
                        <td>${row.frequency.toLocaleString()}</td>
                        <td>${row.percent_responses}%</td>
                        <td>${row.percent_cases}%</td>
                    </tr>
                `).join('')}
                <tr class="total-row">
                    <td>Total</td>
                    <td>Responses (Selections)</td>
                    <td>${data.total_responses.toLocaleString()}</td>
                    <td>100.0%</td>
                    <td>-</td>
                </tr>
                <tr class="total-row">
                    <td>Total</td>
                    <td>Valid Respondents (N)</td>
                    <td>${data.valid_respondents.toLocaleString()}</td>
                    <td>-</td>
                    <td>-</td>
                </tr>
            </tbody>
        `;
        
        // Update Attributes Card
        el.attrName.textContent = data.group_name;
        el.attrLevel.textContent = 'Multi-Response';
        el.attrType.textContent = 'Merged Dict';
        el.attrFormat.textContent = 'Multiple Dichotomy';
        el.attrLabel.value = data.group_label;
        
        // Show delete button
        el.groupActions.style.display = 'block';
        
        // Collapsible value labels don't apply to merged multi-responses directly
        el.valLabelsCollapsible.style.display = 'none';
        
        // Render Chart
        refreshCurrentChart();
        
    } catch (e) {
        showModal('Error Loading Group', e.message);
    }
    lucide.createIcons();
}

// Generate Cross-Tabulation
async function generateCrosstabs() {
    const checkedRows = el.crosstabRowVars.querySelectorAll('input[type="checkbox"]:checked');
    const checkedCols = el.crosstabColVars.querySelectorAll('input[type="checkbox"]:checked');
    
    const rowVariables = Array.from(checkedRows).map(cb => cb.value);
    const colVariables = Array.from(checkedCols).map(cb => cb.value);
    
    if (rowVariables.length === 0) {
        showModal('Configurator Error', 'Please select at least one Row Variable.');
        return;
    }
    
    if (colVariables.length === 0) {
        showModal('Configurator Error', 'Please select at least one Column Variable.');
        return;
    }
    
    // Show spinner in results
    el.crosstabResults.innerHTML = `
        <div class="loader-container" style="padding: 2rem;">
            <div class="spinner"></div>
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.5rem;">Calculating contingency matrices... Mapping distributions...</p>
        </div>
    `;
    
    try {
        const response = await fetch('/api/crosstab', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                row_variables: rowVariables,
                column_variables: colVariables
            })
        });
        
        if (!response.ok) throw new Error('Failed to generate Cross-Tabulation tables.');
        
        const data = await response.json();
        
        state.crosstabResults = data.results;
        
        // Render Tables
        renderCrosstabResults();
        
    } catch (e) {
        showModal('Calculation Error', e.message);
        el.crosstabResults.innerHTML = `
            <div style="padding: 1.5rem; text-align: center; color: var(--accent-rose); font-size: 0.8rem;">
                <i data-lucide="alert-triangle" style="width: 24px; height: 24px; margin-bottom: 0.5rem;"></i>
                <p>Failed to generate Crosstabs: ${e.message}</p>
            </div>
        `;
        lucide.createIcons();
    }
}

// Render Crosstab Results
function renderCrosstabResults() {
    el.crosstabResults.innerHTML = '';
    
    if (!state.crosstabResults || state.crosstabResults.length === 0) {
        el.crosstabResults.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; color: var(--text-muted); gap: 0.5rem; border: 1px dashed var(--border-color); border-radius: 12px; background: rgba(15,23,42,0.1);">
                <i data-lucide="grid" style="width: 32px; height: 32px;"></i>
                <p style="font-size: 0.8rem;">No results found. Verify variables have overlapping valid values.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }
    
    const pctMode = el.crosstabPercentageSelect.value;
    
    state.crosstabResults.forEach((ct, ctIdx) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.flexShrink = '0';
        
        // Card Title / Header
        const cardTitle = document.createElement('h2');
        cardTitle.className = 'card-title';
        const colNames = ct.columns_groups.map(g => g.variable_name).join(', ');
        cardTitle.innerHTML = `
            <span class="card-title-left" style="font-size: 0.85rem;">
                <i data-lucide="grid"></i> 
                <strong>${ct.row_variable}</strong> (${ct.row_label}) 
                <span style="color: var(--text-muted); margin: 0 0.25rem;">×</span> 
                <strong>Banner</strong> (${colNames})
            </span>
            <button class="btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;" onclick="exportCrosstabToCSV(${ctIdx})">
                <i data-lucide="download" style="width: 12px; height: 12px;"></i> Export CSV Table
            </button>
        `;
        card.appendChild(cardTitle);
        
        // Build Crosstab Grid Table
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        
        const table = document.createElement('table');
        table.style.fontSize = '0.75rem';
        
        // Headers Row 1: Variable names
        let headerRow1 = `
            <tr>
                <th rowspan="2" style="border-right: 1px solid var(--border-color); vertical-align: bottom; font-weight: bold; color: var(--text-primary); text-transform: uppercase; font-size: 0.7rem;">
                    ${ct.row_variable}<br><span style="font-size: 0.65rem; color: var(--text-muted); font-weight: normal; text-transform: none;">${ct.row_label}</span>
                </th>
                <th rowspan="2" style="vertical-align: bottom; font-weight: bold; border-right: 1px solid var(--border-color); text-align: center;">
                    Total
                </th>
        `;
        
        ct.columns_groups.forEach(group => {
            headerRow1 += `
                <th colspan="${group.categories.length}" style="text-align: center; border-bottom: 1px solid var(--border-color); border-right: 1px solid var(--border-color); font-weight: bold; color: var(--text-primary); text-transform: uppercase; font-size: 0.7rem; padding: 0.5rem;">
                    ${group.variable_name}<br><span style="font-size: 0.65rem; color: var(--text-muted); font-weight: normal; text-transform: none;">${group.variable_label}</span>
                </th>
            `;
        });
        
        headerRow1 += `</tr>`;
        
        // Headers Row 2: Category details
        let headerRow2 = `<tr>`;
        
        ct.columns_groups.forEach(group => {
            group.categories.forEach(col => {
                const labelText = col.label && col.label.trim() !== '' ? col.label : col.code;
                headerRow2 += `
                    <th style="text-align: center; font-weight: 600; border-right: 1px solid var(--border-color); padding: 0.25rem;">
                        ${labelText}<br>
                        <span style="font-size: 0.65rem; font-weight: bold; color: var(--accent-violet);">(${col.letter})</span>
                    </th>
                `;
            });
        });
        
        headerRow2 += `</tr>`;
        
        // Build rows
        let bodyRows = "";
        
        ct.row_categories.forEach((rowCat, rIdx) => {
            const labelText = rowCat.label && rowCat.label.trim() !== '' ? rowCat.label : rowCat.code;
            bodyRows += `
                <tr>
                    <td style="font-weight: 600; border-right: 1px solid var(--border-color); color: var(--text-primary); padding: 0.5rem 0.75rem;">
                        ${labelText}
                    </td>
            `;
            
            // 1. Total column for this row category
            const rCount = ct.total_column.counts[rIdx];
            let rPctStr = "";
            if (pctMode === 'row') {
                rPctStr = `<br><span style="font-size: 0.65rem; color: var(--accent-violet); font-weight: bold;">100.0%</span>`;
            } else if (pctMode === 'column' || pctMode === 'total') {
                rPctStr = `<br><span style="font-size: 0.65rem; color: var(--accent-emerald);">${ct.total_column.percents[rIdx]}%</span>`;
            }
            
            bodyRows += `
                <td style="text-align: center; border-right: 1px solid var(--border-color); background: rgba(139, 92, 246, 0.05); font-weight: bold; padding: 0.5rem;">
                    <strong>${rCount.toLocaleString()}</strong>${rPctStr}
                </td>
            `;
            
            // 2. Loop through all column groups
            ct.columns_groups.forEach(group => {
                group.categories.forEach(colCat => {
                    const count = colCat.counts[rIdx];
                    let percentStr = "";
                    
                    if (pctMode === 'row') {
                        percentStr = `<br><span style="font-size: 0.65rem; color: var(--accent-violet);">${colCat.row_percents[rIdx]}%</span>`;
                    } else if (pctMode === 'column') {
                        percentStr = `<br><span style="font-size: 0.65rem; color: var(--accent-cyan);">${colCat.column_percents[rIdx]}%</span>`;
                    } else if (pctMode === 'total') {
                        percentStr = `<br><span style="font-size: 0.65rem; color: var(--accent-emerald);">${colCat.total_percents[rIdx]}%</span>`;
                    }
                    
                    // Significance testing letter markers
                    let sigStr = "";
                    if (colCat.sig_markers && colCat.sig_markers[rIdx]) {
                        sigStr = ` <span style="font-weight: bold; color: var(--accent-rose); font-size: 0.65rem; margin-left: 2px;" title="Significantly higher than column(s) ${colCat.sig_markers[rIdx]}">${colCat.sig_markers[rIdx]}</span>`;
                    }
                    
                    bodyRows += `
                        <td style="text-align: center; border-right: 1px solid var(--border-color); padding: 0.5rem;">
                            <strong>${count.toLocaleString()}</strong>${percentStr}${sigStr}
                        </td>
                    `;
                });
            });
            
            bodyRows += `</tr>`;
        });
        
        // Build Column Totals Row
        let columnTotalCells = "";
        
        // Total Column Grand Total
        let totalPctTotal = "";
        if (pctMode !== 'none') {
            totalPctTotal = `<br><span style="font-size: 0.65rem; font-weight: bold;">100.0%</span>`;
        }
        columnTotalCells += `
            <td style="text-align: center; font-weight: 800; border-right: 1px solid var(--border-color); background: rgba(139, 92, 246, 0.1); padding: 0.5rem;">
                ${ct.total_column.total.toLocaleString()}${totalPctTotal}
            </td>
        `;
        
        // Column Groups Grand Totals
        ct.columns_groups.forEach(group => {
            group.categories.forEach(colCat => {
                const colTotal = colCat.total;
                let colPctTotal = "";
                
                if (pctMode === 'column') {
                    colPctTotal = `<br><span style="font-size: 0.65rem; color: var(--accent-cyan); font-weight: bold;">100.0%</span>`;
                } else if (pctMode === 'total') {
                    const cTotalPct = ((colTotal / ct.grand_total) * 100.0).toFixed(2);
                    colPctTotal = `<br><span style="font-size: 0.65rem; color: var(--accent-emerald);">${cTotalPct}%</span>`;
                }
                
                columnTotalCells += `
                    <td style="text-align: center; font-weight: bold; border-right: 1px solid var(--border-color); padding: 0.5rem;">
                        ${colTotal.toLocaleString()}${colPctTotal}
                    </td>
                `;
            });
        });
        
        const totalRow = `
            <tr class="total-row" style="background: rgba(15,23,42,0.2);">
                <td style="font-weight: bold; border-right: 1px solid var(--border-color); padding: 0.5rem 0.75rem;">Total</td>
                ${columnTotalCells}
            </tr>
        `;
        
        table.innerHTML = `
            <thead>
                ${headerRow1}
                ${headerRow2}
            </thead>
            <tbody>
                ${bodyRows}
                ${totalRow}
            </tbody>
        `;
        
        tableContainer.appendChild(table);
        card.appendChild(tableContainer);
        
        // Summary statistics footer
        const footer = document.createElement('div');
        footer.style.display = 'flex';
        footer.style.justifyContent = 'space-between';
        footer.style.fontSize = '0.7rem';
        footer.style.color = 'var(--text-secondary)';
        footer.style.marginTop = '0.25rem';
        
        const validPct = ct.valid_count / (ct.valid_count + ct.missing_count) * 100.0;
        const missingPct = ct.missing_count / (ct.valid_count + ct.missing_count) * 100.0;
        
        footer.innerHTML = `
            <span>Valid cases: <strong>${ct.valid_count.toLocaleString()}</strong> (${validPct.toFixed(1)}%)</span>
            <span>Missing cases: <strong>${ct.missing_count.toLocaleString()}</strong> (${missingPct.toFixed(1)}%)</span>
        `;
        card.appendChild(footer);
        
        el.crosstabResults.appendChild(card);
    });
    
    lucide.createIcons();
}

// Copy Crosstab Table to Clipboard in TSV format
// Export Crosstab Table to CSV format and trigger download
window.exportCrosstabToCSV = function(idx) {
    const data = state.crosstabResults[idx];
    if (!data) return;
    
    const pctMode = el.crosstabPercentageSelect.value;
    
    // Helper to escape CSV cell values
    const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        let str = val.toString();
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            str = str.replace(/"/g, '""');
            return `"${str}"`;
        }
        return str;
    };
    
    let csv = "";
    // Title
    csv += `${escapeCSV(data.row_variable + ' (' + data.row_label + ') * Banner Crosstabulation')}\n\n`;
    
    // Headers Row 1: Variable names
    csv += `,Total,`;
    data.columns_groups.forEach(group => {
        csv += `${escapeCSV(group.variable_name + ' (' + group.variable_label + ')')},`;
        for (let i = 1; i < group.categories.length; i++) {
            csv += `,`;
        }
    });
    // Remove the trailing comma
    if (csv.endsWith(',')) csv = csv.slice(0, -1);
    csv += `\n`;
    
    // Headers Row 2: Category details
    csv += `${escapeCSV(data.row_variable)},Total,`;
    data.columns_groups.forEach(group => {
        group.categories.forEach(col => {
            const labelText = col.label && col.label.trim() !== '' ? col.label : col.code;
            csv += `${escapeCSV(labelText + ' (' + col.letter + ')')},`;
        });
    });
    // Remove trailing comma
    if (csv.endsWith(',')) csv = csv.slice(0, -1);
    csv += `\n`;
    
    // Rows
    data.row_categories.forEach((row, rIdx) => {
        const labelText = row.label && row.label.trim() !== '' ? row.label : row.code;
        csv += `${escapeCSV(labelText)},`;
        
        // Total column cell
        const rCount = data.total_column.counts[rIdx];
        let rPctText = "";
        if (pctMode === 'row') rPctText = " (100.0%)";
        else if (pctMode === 'column' || pctMode === 'total') rPctText = ` (${data.total_column.percents[rIdx]}%)`;
        csv += `${escapeCSV(rCount + rPctText)},`;
        
        // Category cells
        data.columns_groups.forEach(group => {
            group.categories.forEach(col => {
                const count = col.counts[rIdx];
                let cellText = count.toString();
                
                if (pctMode === 'row') cellText += ` (${col.row_percents[rIdx]}%)`;
                else if (pctMode === 'column') cellText += ` (${col.column_percents[rIdx]}%)`;
                else if (pctMode === 'total') cellText += ` (${col.total_percents[rIdx]}%)`;
                
                if (col.sig_markers && col.sig_markers[rIdx]) {
                    cellText += ` ${col.sig_markers[rIdx]}`;
                }
                
                csv += `${escapeCSV(cellText)},`;
            });
        });
        // Remove trailing comma
        if (csv.endsWith(',')) csv = csv.slice(0, -1);
        csv += `\n`;
    });
    
    // Bottom Total Row
    csv += `Total,`;
    // Total Column grand total
    let totalPctText = "";
    if (pctMode !== 'none') totalPctText = " (100.0%)";
    csv += `${escapeCSV(data.total_column.total + totalPctText)},`;
    
    // Category totals
    data.columns_groups.forEach(group => {
        group.categories.forEach(col => {
            const colTotal = col.total;
            let colPctText = "";
            if (pctMode === 'column') colPctText = " (100.0%)";
            else if (pctMode === 'total') {
                const cTotalPct = ((colTotal / data.grand_total) * 100.0).toFixed(2);
                colPctText = ` (${cTotalPct}%)`;
            }
            csv += `${escapeCSV(colTotal + colPctText)},`;
        });
    });
    // Remove trailing comma
    if (csv.endsWith(',')) csv = csv.slice(0, -1);
    csv += `\n`;
    
    // Trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const filename = `crosstab_${data.row_variable.toLowerCase()}_banner.csv`;
    
    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, filename);
    } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Helper to determine coloring details from HTML theme setting
function getThemeColors() {
    const isLight = document.body.classList.contains('light-theme');
    return {
        gridColor: isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.03)',
        tickColor: isLight ? '#475569' : '#94a3b8',
        gradientStart: isLight ? 'rgba(139, 92, 246, 0.35)' : 'rgba(139, 92, 246, 0.45)',
        gradientEnd: isLight ? 'rgba(6, 182, 212, 0.01)' : 'rgba(6, 182, 212, 0.05)'
    };
}

// Render dynamic visualization using Chart.js
function renderChart(labels, data, labelText, orientation = 'vertical') {
    if (state.chartInstance) {
        state.chartInstance.destroy();
    }
    
    const ctx = el.distributionChart.getContext('2d');
    
    // Resolve theme variables
    const themeColors = getThemeColors();
    
    // Create gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, themeColors.gradientStart);
    gradient.addColorStop(1, themeColors.gradientEnd);
    
    const isHorizontal = orientation === 'horizontal';
    const isPercentMode = state.chartMetric === 'percent';
    
    state.chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: labelText,
                data: data,
                backgroundColor: gradient,
                borderColor: '#8b5cf6',
                borderWidth: 1.25,
                borderRadius: 5,
                hoverBackgroundColor: 'rgba(139, 92, 246, 0.75)',
                hoverBorderColor: '#06b6d4',
            }]
        },
        options: {
            indexAxis: isHorizontal ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: document.body.classList.contains('light-theme') ? 'rgba(255, 255, 255, 0.98)' : 'rgba(8, 12, 24, 0.95)',
                    titleFont: { family: 'Plus Jakarta Sans', weight: 'bold', size: 12 },
                    bodyFont: { family: 'Plus Jakarta Sans', size: 12 },
                    titleColor: document.body.classList.contains('light-theme') ? '#0f172a' : '#f8fafc',
                    bodyColor: document.body.classList.contains('light-theme') ? '#475569' : '#94a3b8',
                    borderColor: document.body.classList.contains('light-theme') ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            const valStr = context.raw.toLocaleString();
                            return ` ${context.dataset.label}: ${valStr}${isPercentMode ? '%' : ''}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: themeColors.gridColor
                    },
                    ticks: {
                        color: themeColors.tickColor,
                        font: { family: 'Plus Jakarta Sans', size: 10 },
                        callback: function(value) {
                            if (isHorizontal && isPercentMode) {
                                return value + '%';
                            }
                            return this.getLabelForValue(value);
                        }
                    }
                },
                y: {
                    grid: {
                        color: themeColors.gridColor
                    },
                    ticks: {
                        color: themeColors.tickColor,
                        font: { family: 'Plus Jakarta Sans', size: 10 },
                        callback: function(value) {
                            if (!isHorizontal && isPercentMode) {
                                return value + '%';
                            }
                            return this.getLabelForValue(value);
                        }
                    }
                }
            }
        }
    });
}

// Create custom Multi-Response Group
async function createCustomMultiResponseGroup() {
    const name = el.mrName.value.trim();
    const label = el.mrLabel.value.trim();
    const checkedVal = el.mrCheckedValue.value.trim();
    
    // Gather checked variables
    const checkedCheckboxes = el.mrVariablesSelectList.querySelectorAll('input[type="checkbox"]:checked');
    const selectedVars = Array.from(checkedCheckboxes).map(cb => cb.value);
    
    if (!name) {
        showModal('Input Error', 'Please enter a name for the multi-response group.');
        return;
    }
    if (!label) {
        showModal('Input Error', 'Please enter a label/description for the group.');
        return;
    }
    if (selectedVars.length < 2) {
        showModal('Input Error', 'Please select at least 2 variables to combine.');
        return;
    }
    
    const body = {
        group_name: name,
        group_label: label,
        variables: selectedVars
    };
    
    if (checkedVal) {
        body.checked_value = checkedVal;
    }
    
    try {
        const response = await fetch('/api/multi-response/group', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to create group');
        }
        
        const data = await response.json();
        
        // Add new group to state (or update if exists)
        const idx = state.multiResponseGroups.findIndex(g => g.group_id === data.group.group_id);
        if (idx !== -1) {
            state.multiResponseGroups[idx] = data.group;
        } else {
            state.multiResponseGroups.push(data.group);
        }
        
        // Reset form inputs
        el.mrName.value = '';
        el.mrLabel.value = '';
        el.mrCheckedValue.value = '';
        el.mrVariablesSelectList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        
        // Re-render
        renderVariableLists();
        
        // Auto-select the newly created group
        selectVariableOrGroup(data.group.group_id, true);
        
    } catch (e) {
        showModal('Error Creating Group', e.message);
    }
}

// Delete selected multi-response group
async function deleteSelectedMultiResponseGroup() {
    if (!state.isSelectedGroup || !state.selectedVar) return;
    
    const groupId = state.selectedVar;
    
    try {
        const response = await fetch(`/api/multi-response/group/${groupId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete group.');
        
        // Remove from state
        state.multiResponseGroups = state.multiResponseGroups.filter(g => g.group_id !== groupId);
        state.selectedVar = null;
        state.isSelectedGroup = false;
        state.currentData = null;
        
        // Re-render
        renderVariableLists();
        
        // Reset main view
        el.noSelectionPlaceholder.style.display = 'flex';
        el.workspaceLayout.style.display = 'none';
        
    } catch (e) {
        showModal('Error Deleting Group', e.message);
    }
}

// Trigger Excel / CSV Export
function triggerExport(format) {
    if (!state.filename) {
        showModal('No Dataset', 'Please upload a dataset first.');
        return;
    }
    
    // Redirect to export API endpoint
    window.location.href = `/api/dictionary/export?format=${format}`;
}
