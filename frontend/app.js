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
    crosstabResults: null, // Cache of generated crosstab results
    
    // Data View Grid State
    dataViewPage: 1,
    dataViewPageSize: 100,
    showValueLabels: false,
    dataViewFilters: {}, // Maps column name to search query
    dataViewFilteredCount: 0, // Total cases matching active filters
    dataViewLoaded: false,
    dataViewFilename: null,
    dataViewColumns: [],
    dataViewRows: [],

    // Frequencies State
    frequenciesLoaded: false,
    frequenciesFilename: null
};

// DOM Elements
const el = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('file-input'),
    loader: document.getElementById('loader'),
    dashboardContainer: document.getElementById('dashboard-container'),
    uploadOverlay: document.getElementById('upload-overlay'),
    headerNav: document.getElementById('header-nav'),
    mainContent: document.getElementById('main-content'),
    noSelectionPlaceholder: document.getElementById('freq-selection-placeholder'),
    workspaceLayout: document.getElementById('freq-workspace'),
    freqTablesContainer: document.getElementById('freq-tables-container'),
    existingProjectsContainer: document.getElementById('existing-projects-container'),
    projectsListBody: document.getElementById('projects-list-body'),
    
    // Data View DOM bindings
    dataChkValueLabels: document.getElementById('data-chk-value-labels'),
    dataBtnPrev: document.getElementById('data-btn-prev'),
    dataBtnNext: document.getElementById('data-btn-next'),
    dataPaginationInfo: document.getElementById('data-pagination-info'),
    dataTableHeader: document.getElementById('data-table-head'),
    dataTableBody: document.getElementById('data-table-body'),
    dataRecordCountBadge: document.getElementById('data-record-count-badge'),
    btnClearDataFilters: document.getElementById('btn-clear-data-filters'),
    btnExportDataView: document.getElementById('btn-export-data-view'),
    btnDataColumnJump: document.getElementById('btn-data-column-jump'),
    dataColumnJumpDropdown: document.getElementById('data-column-jump-dropdown'),
    dataColumnJumpSearch: document.getElementById('data-column-jump-search'),
    dataColumnJumpList: document.getElementById('data-column-jump-list'),
    
    // Header Actions
    headerActions: document.getElementById('header-actions'),
    btnHome: document.getElementById('btn-home'),
    activeFilenameVar: document.getElementById('active-filename-var'),
    activeFilenameData: document.getElementById('active-filename-data'),
    btnExportDictCard: document.getElementById('btn-export-dict-card'),
    btnToggleTheme: document.getElementById('btn-toggle-theme'),
    themeIcon: document.getElementById('theme-icon'),
    
    // Lists
    searchInput: document.getElementById('freq-search-input'),
    countGroups: document.getElementById('count-groups'),
    countVariables: document.getElementById('count-variables'),
    multiResponseList: document.getElementById('freq-multi-response-list'),
    singleVariablesList: document.getElementById('freq-single-variables-list'),
    mrVariablesSelectList: document.getElementById('mr-variables-select-list'),
    
    // Clipboard Copy
    btnCopyCrosstabClipboard: document.getElementById('btn-copy-crosstab-clipboard'),
    
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
        fetchProjectsList();
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

    if (el.valLabelsToggle) {
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
    }
    
    // Custom Multi-Response Group Creation
    if (el.btnCreateGroup) {
        el.btnCreateGroup.addEventListener('click', createCustomMultiResponseGroup);
    }
    
    // Delete custom group
    if (el.btnDeleteGroup) {
        el.btnDeleteGroup.addEventListener('click', deleteSelectedMultiResponseGroup);
    }

    // Export Data Dictionary Excel from Card
    if (el.btnExportDictCard) {
        el.btnExportDictCard.addEventListener('click', () => triggerExport('excel'));
    }
    
    // Export SAV File from Variable View Card
    const btnExportSavVar = document.getElementById('btn-export-sav-var');
    if (btnExportSavVar) {
        btnExportSavVar.addEventListener('click', () => {
            window.location.href = '/api/data/download-sav';
        });
    }
    
    // Home button click
    el.btnHome.addEventListener('click', goHome);
    
    // Modal Dismiss
    el.btnModalClose.addEventListener('click', hideModal);

    // Delete Variables click & preset/drag-drop listeners
    const btnDeleteVars = document.getElementById('btn-delete-vars-card');
    if (btnDeleteVars) {
        btnDeleteVars.addEventListener('click', openDeleteVarsModal);
    }
    
    const presetSelect = document.getElementById('delete-vars-preset-select');
    if (presetSelect) {
        presetSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            if (val) {
                try {
                    const vars = JSON.parse(val);
                    const activeVarNamesMap = {};
                    state.variables.forEach(v => {
                        activeVarNamesMap[v.variable_name.toLowerCase()] = v.variable_name;
                    });
                    
                    const matched = vars
                        .filter(name => activeVarNamesMap[name.toLowerCase()] !== undefined)
                        .map(name => activeVarNamesMap[name.toLowerCase()]);
                    
                    if (matched.length === 0) {
                        showDeleteVarsError('The variables in this preset have already been deleted from the dataset.');
                        e.target.value = '';
                        // Uncheck everything
                        const cbs = document.querySelectorAll('.delete-var-cb');
                        cbs.forEach(cb => cb.checked = false);
                        updateDeleteVarsCountSelected();
                        return;
                    }
                    
                    clearDeleteVarsError();
                    
                    const cbs = document.querySelectorAll('.delete-var-cb');
                    cbs.forEach(cb => {
                        cb.checked = matched.includes(cb.value);
                    });
                    updateDeleteVarsCountSelected();
                    
                    if (matched.length < vars.length) {
                        const missingCount = vars.length - matched.length;
                        showDeleteVarsError(`Selected ${matched.length} variables. Note: ${missingCount} variables in preset were already deleted.`);
                    }
                } catch (err) {
                    console.error('Error parsing preset variables:', err);
                }
            } else {
                clearDeleteVarsError();
            }
        });
    }

    const checklistSearch = document.getElementById('delete-vars-search-input');
    if (checklistSearch) {
        checklistSearch.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            const selectMatchingBtn = document.getElementById('btn-delete-vars-select-matching');
            
            if (selectMatchingBtn) {
                selectMatchingBtn.style.display = query ? 'inline-block' : 'none';
            }
            
            const container = document.getElementById('delete-vars-checklist-container');
            if (container) {
                const labels = container.querySelectorAll('label');
                labels.forEach(label => {
                    const text = label.textContent.toLowerCase();
                    const isMatch = text.includes(query);
                    label.style.display = isMatch ? 'flex' : 'none';
                });
            }
        });
    }

    const dropzone = document.getElementById('delete-vars-dropzone');
    const fileInput = document.getElementById('delete-vars-file-input');
    const fileStatus = document.getElementById('delete-vars-file-status');
    const fileNameText = document.getElementById('delete-vars-file-name-text');
    
    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        
        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });
        
        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleDeleteVarsFile(e.dataTransfer.files[0]);
            }
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleDeleteVarsFile(e.target.files[0]);
            }
        });
    }

    function handleDeleteVarsFile(file) {
        if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
            showDeleteVarsError('Please upload a plain text (.txt) file.');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
            
            const activeVarNamesMap = {};
            state.variables.forEach(v => {
                activeVarNamesMap[v.variable_name.toLowerCase()] = v.variable_name;
            });
            
            const matchedVars = lines
                .filter(name => activeVarNamesMap[name.toLowerCase()] !== undefined)
                .map(name => activeVarNamesMap[name.toLowerCase()]);
                
            const missingVars = lines.filter(name => activeVarNamesMap[name.toLowerCase()] === undefined);
            
            if (matchedVars.length === 0) {
                showDeleteVarsError('The variables in the uploaded file have already been deleted or do not exist in the current dataset.');
                deleteVarsUploadedList = [];
                if (fileInput) fileInput.value = '';
                if (fileStatus) fileStatus.style.display = 'none';
                return;
            }
            
            clearDeleteVarsError();
            deleteVarsUploadedList = matchedVars;
            
            if (fileNameText) {
                fileNameText.textContent = `${file.name} (${matchedVars.length} matched, ${missingVars.length} not found)`;
            }
            if (fileStatus) {
                fileStatus.style.display = 'flex';
            }
        };
        reader.readAsText(file);
    }


    // Chart Metric Toggles
    if (el.toggleFreqBtn) el.toggleFreqBtn.addEventListener('click', () => setChartMetric('frequency'));
    if (el.togglePctBtn) el.togglePctBtn.addEventListener('click', () => setChartMetric('percent'));

    // Dictionary Search Input
    const dictSearchInput = document.getElementById('dict-search-input');
    if (dictSearchInput) {
        dictSearchInput.addEventListener('input', (e) => {
            renderDataDictionaryTable(e.target.value);
        });
    }

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

    // Copy Crosstab to Clipboard
    if (el.btnCopyCrosstabClipboard) {
        el.btnCopyCrosstabClipboard.addEventListener('click', copyCrosstabsToClipboard);
    }

    // Data View Show Value Labels Checkbox Toggle
    if (el.dataChkValueLabels) {
        el.dataChkValueLabels.addEventListener('change', (e) => {
            state.showValueLabels = e.target.checked;
            if (state.dataViewLoaded) {
                renderDataViewTable();
            }
        });
    }

    // Data View Clear Filters Click
    if (el.btnClearDataFilters) {
        el.btnClearDataFilters.addEventListener('click', () => {
            state.dataViewFilters = {};
            loadDataView(1); // Reload data view on page 1
        });
    }

    // Data View Export Click
    if (el.btnExportDataView) {
        el.btnExportDataView.addEventListener('click', () => {
            if (!state.filename) return;
            const filtersStr = JSON.stringify(state.dataViewFilters);
            window.location.href = `/api/data/export?value_labels=${state.showValueLabels}&filters=${encodeURIComponent(filtersStr)}`;
        });
    }

    // Export SAV File from Data View Card
    const btnExportSavData = document.getElementById('btn-export-sav-data');
    if (btnExportSavData) {
        btnExportSavData.addEventListener('click', () => {
            window.location.href = '/api/data/download-sav';
        });
    }

    // Column Jump Dropdown Toggle click
    if (el.btnDataColumnJump) {
        el.btnDataColumnJump.addEventListener('click', () => {
            toggleColumnJumpDropdown();
        });
    }

    // Column Jump Dropdown search input event
    if (el.dataColumnJumpSearch) {
        el.dataColumnJumpSearch.addEventListener('input', (e) => {
            renderColumnJumpList(e.target.value);
        });
    }

    // Data View Pagination Prev
    if (el.dataBtnPrev) {
        el.dataBtnPrev.addEventListener('click', () => {
            if (state.dataViewPage > 1) {
                loadDataView(state.dataViewPage - 1);
            }
        });
    }

    // Data View Pagination Next
    if (el.dataBtnNext) {
        el.dataBtnNext.addEventListener('click', () => {
            const maxPage = Math.ceil(state.dataViewFilteredCount / state.dataViewPageSize);
            if (state.dataViewPage < maxPage) {
                loadDataView(state.dataViewPage + 1);
            }
        });
    }

    setupRenameEventListeners();
}

// Theme Management
function loadSavedTheme() {
    document.body.classList.add('light-theme');
    localStorage.setItem('spss-theme', 'light');
}

function toggleTheme() {
    // Theme switching is disabled (light-theme only)
}

// Tabs Navigation
// Navigation menu switching
function switchNavMenu(menuId) {
    const views = {
        'variables': document.getElementById('view-variables'),
        'data': document.getElementById('view-data'),
        'frequency': document.getElementById('view-frequency'),
        'crosstabs': document.getElementById('view-crosstabs')
    };
    
    const buttons = {
        'variables': document.getElementById('header-btn-variables'),
        'data': document.getElementById('header-btn-data'),
        'frequency': document.getElementById('header-btn-frequency'),
        'crosstabs': document.getElementById('header-btn-crosstabs')
    };

    // Toggle button active class
    for (const [key, btn] of Object.entries(buttons)) {
        if (btn) {
            if (key === menuId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    }

    // Toggle view visibility
    for (const [key, view] of Object.entries(views)) {
        if (view) {
            if (key === menuId) {
                view.style.display = 'flex';
            } else {
                view.style.display = 'none';
            }
        }
    }
    
    // Auto-fetch data if switching to data view and it's not loaded yet
    if (menuId === 'data' && state.filename && (!state.dataViewLoaded || state.dataViewFilename !== state.filename)) {
        loadDataView(1);
    }

    // Auto-fetch all frequencies if switching to frequency tab and not loaded yet
    if (menuId === 'frequency' && state.filename) {
        if (el.workspaceLayout) el.workspaceLayout.style.display = 'flex';
        if (!state.frequenciesLoaded || state.frequenciesFilename !== state.filename) {
            loadAllVariableFrequencies();
        }
    }
}
window.switchNavMenu = switchNavMenu;

// Variable Deletion State
let deleteVarsActiveTab = 'list';
let deleteVarsUploadedList = [];
let deleteVarsSelectedList = [];

// Fetch and render presets dropdown
async function loadDeleteVarsPresets() {
    try {
        const response = await fetch('/api/variables/deletion-presets');
        if (!response.ok) throw new Error('Failed to load presets');
        const presets = await response.json();
        
        const select = document.getElementById('delete-vars-preset-select');
        if (select) {
            // Keep first option
            select.innerHTML = '<option value="">-- No Preset Selected --</option>';
            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = JSON.stringify(p.variables);
                opt.textContent = `${p.name} (${p.variables.length} variables)`;
                select.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error fetching deletion presets:', e);
    }
}

// Show delete variables inline error
function showDeleteVarsError(msg) {
    const errContainer = document.getElementById('delete-vars-step-error');
    const errMsg = document.getElementById('delete-vars-step-error-msg');
    if (errContainer && errMsg) {
        errMsg.textContent = msg;
        errContainer.style.display = 'flex';
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}
window.showDeleteVarsError = showDeleteVarsError;

// Clear delete variables inline error
function clearDeleteVarsError() {
    const errContainer = document.getElementById('delete-vars-step-error');
    if (errContainer) {
        errContainer.style.display = 'none';
    }
}
window.clearDeleteVarsError = clearDeleteVarsError;

// Open variable deletion modal
function openDeleteVarsModal() {
    if (!state.variables || state.variables.length === 0) {
        showModal('Error', 'No active variables in dataset to delete.');
        return;
    }
    
    // Clear inline error
    clearDeleteVarsError();
    
    // Clear inputs & state
    deleteVarsActiveTab = 'list';
    deleteVarsUploadedList = [];
    deleteVarsSelectedList = [];
    
    const presetSelect = document.getElementById('delete-vars-preset-select');
    if (presetSelect) presetSelect.value = '';
    
    const customNameInput = document.getElementById('delete-vars-custom-preset-name');
    if (customNameInput) customNameInput.value = '';
    
    const fileStatus = document.getElementById('delete-vars-file-status');
    if (fileStatus) fileStatus.style.display = 'none';
    
    const fileInput = document.getElementById('delete-vars-file-input');
    if (fileInput) fileInput.value = '';
    
    const checklistSearch = document.getElementById('delete-vars-search-input');
    if (checklistSearch) checklistSearch.value = '';
    
    const selectMatchingBtn = document.getElementById('btn-delete-vars-select-matching');
    if (selectMatchingBtn) selectMatchingBtn.style.display = 'none';
    
    // Go to first step
    goToDeleteVarsConfig();
    
    // Switch tabs to list
    switchDeleteTab('list');
    
    // Render variables checklist
    renderDeleteVarsChecklist();
    
    // Load presets history
    loadDeleteVarsPresets();
    
    // Show modal
    const modal = document.getElementById('modal-delete-vars');
    if (modal) modal.classList.add('active');
}
window.openDeleteVarsModal = openDeleteVarsModal;

// Close deletion modal
function closeDeleteVarsModal() {
    const modal = document.getElementById('modal-delete-vars');
    if (modal) modal.classList.remove('active');
}
window.closeDeleteVarsModal = closeDeleteVarsModal;

// Tab switcher
function switchDeleteTab(tabId) {
    deleteVarsActiveTab = tabId;
    clearDeleteVarsError();
    
    const btnList = document.getElementById('delete-tab-btn-list');
    const btnFile = document.getElementById('delete-tab-btn-file');
    const contentList = document.getElementById('delete-tab-content-list');
    const contentFile = document.getElementById('delete-tab-content-file');
    
    if (tabId === 'list') {
        if (btnList) btnList.classList.add('active');
        if (btnFile) btnFile.classList.remove('active');
        if (contentList) contentList.style.display = 'flex';
        if (contentFile) contentFile.style.display = 'none';
    } else {
        if (btnList) btnList.classList.remove('active');
        if (btnFile) btnFile.classList.add('active');
        if (contentList) contentList.style.display = 'none';
        if (contentFile) contentFile.style.display = 'flex';
    }
}
window.switchDeleteTab = switchDeleteTab;

// Render checklist of all active variables
function renderDeleteVarsChecklist() {
    const container = document.getElementById('delete-vars-checklist-container');
    if (!container) return;
    
    container.innerHTML = state.variables.map(v => {
        const labelText = v.variable_label ? ` - ${v.variable_label}` : '';
        return `
            <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-primary); cursor: pointer; padding: 0.15rem 0;">
                <input type="checkbox" class="delete-var-cb" value="${v.variable_name}" onchange="updateDeleteVarsCountSelected()">
                <span style="font-family: monospace; font-weight: 600;">${v.variable_name}</span>
                <span style="color: var(--text-secondary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 250px;" title="${v.variable_label || ''}">${labelText}</span>
            </label>
        `;
    }).join('');
    
    updateDeleteVarsCountSelected();
}

// Update the checkbox selection count display
function updateDeleteVarsCountSelected() {
    clearDeleteVarsError();
    const cbs = document.querySelectorAll('.delete-var-cb');
    const count = Array.from(cbs).filter(cb => cb.checked).length;
    
    const display = document.getElementById('delete-vars-count-selected');
    if (display) {
        display.textContent = `${count} variables selected`;
    }
}
window.updateDeleteVarsCountSelected = updateDeleteVarsCountSelected;

// Bulk select/clear checkboxes
function toggleAllDeleteVars(checked) {
    const cbs = document.querySelectorAll('.delete-var-cb');
    cbs.forEach(cb => cb.checked = checked);
    updateDeleteVarsCountSelected();
}
window.toggleAllDeleteVars = toggleAllDeleteVars;

// Bulk check variables that match the active search criteria (are visible)
function selectMatchingDeleteVars() {
    const container = document.getElementById('delete-vars-checklist-container');
    if (!container) return;
    
    const labels = container.querySelectorAll('label');
    labels.forEach(label => {
        if (label.style.display !== 'none') {
            const cb = label.querySelector('input');
            if (cb) cb.checked = true;
        }
    });
    updateDeleteVarsCountSelected();
}
window.selectMatchingDeleteVars = selectMatchingDeleteVars;

// Go to confirmation step
function goToDeleteVarsConfirmation() {
    deleteVarsSelectedList = [];
    
    if (deleteVarsActiveTab === 'list') {
        const cbs = document.querySelectorAll('.delete-var-cb');
        deleteVarsSelectedList = Array.from(cbs).filter(cb => cb.checked).map(cb => cb.value);
    } else {
        deleteVarsSelectedList = deleteVarsUploadedList;
    }
    
    if (deleteVarsSelectedList.length === 0) {
        showDeleteVarsError('Please select or upload at least one variable to delete.');
        return;
    }
    
    if (deleteVarsSelectedList.length >= state.variables.length) {
        showDeleteVarsError('You cannot delete all variables from the dataset. At least one variable must remain.');
        return;
    }
    
    // Fill confirmation list
    const confirmList = document.getElementById('delete-vars-confirmation-list');
    if (confirmList) {
        confirmList.textContent = deleteVarsSelectedList.join(', ');
    }
    
    // Toggle views
    const configView = document.getElementById('delete-vars-step-config');
    const confirmView = document.getElementById('delete-vars-step-confirm');
    
    if (configView) configView.style.display = 'none';
    if (confirmView) confirmView.style.display = 'flex';
}
window.goToDeleteVarsConfirmation = goToDeleteVarsConfirmation;

// Go back to config step
function goToDeleteVarsConfig() {
    const configView = document.getElementById('delete-vars-step-config');
    const confirmView = document.getElementById('delete-vars-step-confirm');
    
    if (configView) configView.style.display = 'flex';
    if (confirmView) confirmView.style.display = 'none';
}
window.goToDeleteVarsConfig = goToDeleteVarsConfig;

// Execute backend API call to delete variables
async function executeVariablesDeletion() {
    if (deleteVarsSelectedList.length === 0) return;
    
    const presetNameInput = document.getElementById('delete-vars-custom-preset-name');
    const presetName = presetNameInput ? presetNameInput.value.trim() : "";
    
    const btn = document.getElementById('btn-delete-vars-confirm');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width: 12px; height: 12px; border-width: 2px; margin: 0;"></span> Deleting...';
    
    try {
        const response = await fetch('/api/variables/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                variables: deleteVarsSelectedList,
                preset_name: presetName || null
            })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to delete variables');
        }
        
        const res = await response.json();
        
        // Update local session state dictionary
        state.variables = res.dictionary;
        
        // Invalidate Data View since columns are changed
        state.dataViewLoaded = false;
        state.dataViewFilename = null;
        state.dataViewColumns = [];
        state.dataViewRows = [];
        
        // Re-render variable list & builders
        renderVariableLists();
        populateMultiResponseBuilderCheckboxes();
        populateCrosstabBuilders();
        renderDataDictionaryTable();
        
        // Close modal
        closeDeleteVarsModal();
        
        // Show success alert
        showModal('Success', `Successfully deleted ${res.deleted_count} variables. ${res.remaining_count} variables remain in the dataset.`);
        
    } catch (e) {
        showModal('Error', e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
window.executeVariablesDeletion = executeVariablesDeletion;

// Copy Crosstab Table to Clipboard in TSV format
async function copyCrosstabsToClipboard() {
    if (!state.crosstabResults || state.crosstabResults.length === 0) {
        showModal('Copy Error', 'No crosstab results to copy.');
        return;
    }
    
    const pctMode = el.crosstabPercentageSelect.value;
    let tsv = "";
    
    state.crosstabResults.forEach((ct, ctIdx) => {
        const colNames = ct.columns_groups.map(g => g.variable_name).join(', ');
        tsv += `${ct.row_variable} (${ct.row_label}) * Banner (${colNames})\n\n`;
        
        // Row 1: Variable Name headers
        tsv += `\tTotal\t`;
        ct.columns_groups.forEach(group => {
            tsv += `${group.variable_name} (${group.variable_label})`;
            for (let i = 0; i < group.categories.length; i++) {
                tsv += `\t`;
            }
        });
        tsv += `\n`;
        
        // Row 2: Category labels/codes
        tsv += `${ct.row_variable}\tTotal\t`;
        ct.columns_groups.forEach(group => {
            group.categories.forEach(col => {
                const labelText = col.label && col.label.trim() !== '' ? col.label : col.code;
                tsv += `${labelText} (${col.letter})\t`;
            });
        });
        tsv += `\n`;
        
        // Content rows
        ct.row_categories.forEach((rowCat, rIdx) => {
            const rowLabelText = rowCat.label && rowCat.label.trim() !== '' ? rowCat.label : rowCat.code;
            tsv += `${rowLabelText}\t`;
            
            // Total Column
            const rCount = ct.total_column.counts[rIdx];
            let rPctText = "";
            if (pctMode === 'row') rPctText = " (100.0%)";
            else if (pctMode === 'column' || pctMode === 'total') rPctText = ` (${ct.total_column.percents[rIdx]}%)`;
            tsv += `${rCount}${rPctText}\t`;
            
            // Groups
            ct.columns_groups.forEach(group => {
                group.categories.forEach(colCat => {
                    const count = colCat.counts[rIdx];
                    let percentStr = "";
                    if (pctMode === 'row') {
                        percentStr = ` (${colCat.row_percents[rIdx]}%)`;
                    } else if (pctMode === 'column') {
                        percentStr = ` (${colCat.column_percents[rIdx]}%)`;
                    } else if (pctMode === 'total') {
                        percentStr = ` (${colCat.total_percents[rIdx]}%)`;
                    }
                    
                    let sigStr = "";
                    if (colCat.sig_markers && colCat.sig_markers[rIdx]) {
                        sigStr = ` ${colCat.sig_markers[rIdx]}`;
                    }
                    
                    tsv += `${count}${percentStr}${sigStr}\t`;
                });
            });
            tsv += `\n`;
        });
        
        // Total row
        tsv += `Total\t`;
        let totalPctTotal = "";
        if (pctMode !== 'none') totalPctTotal = " (100.0%)";
        tsv += `${ct.total_column.total}${totalPctTotal}\t`;
        
        ct.columns_groups.forEach(group => {
            group.categories.forEach(colCat => {
                const colTotal = colCat.total;
                let colPctTotal = "";
                if (pctMode === 'column') {
                    colPctTotal = " (100.0%)";
                } else if (pctMode === 'total') {
                    const cTotalPct = ((colTotal / ct.grand_total) * 100.0).toFixed(2);
                    colPctTotal = ` (${cTotalPct}%)`;
                }
                tsv += `${colTotal}${colPctTotal}\t`;
            });
        });
        tsv += `\n\n`;
    });
    
    try {
        await navigator.clipboard.writeText(tsv);
        showModal('Copied!', 'Crosstab table(s) copied to clipboard in TSV format (ready to paste in Excel).');
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = tsv;
        textarea.style.position = 'fixed';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showModal('Copied!', 'Crosstab table(s) copied to clipboard in TSV format (ready to paste in Excel).');
        } catch (e) {
            showModal('Clipboard Error', 'Failed to copy to clipboard.');
        }
        document.body.removeChild(textarea);
    }
}
window.copyCrosstabsToClipboard = copyCrosstabsToClipboard;

// Return back to Home / Upload landing screen
function goHome() {
    // Show landing screen overlay, hide workspace panels
    el.uploadOverlay.style.display = 'flex';
    el.dropzone.style.display = 'flex';
    el.loader.style.display = 'none';
    el.headerActions.style.display = 'none';
    el.headerNav.style.display = 'none';
    el.mainContent.style.display = 'none';
    
    // Clear selected states
    state.selectedVar = null;
    state.isSelectedGroup = false;
    state.currentData = null;
    state.crosstabResults = null;
    
    // De-select list items
    document.querySelectorAll('.variable-item').forEach(item => item.classList.remove('active'));
    
    // Refresh the list of saved projects from server
    fetchProjectsList();
}
window.goHome = goHome;

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
    if (el.toggleFreqBtn) el.toggleFreqBtn.classList.toggle('active', metric === 'frequency');
    if (el.togglePctBtn) el.togglePctBtn.classList.toggle('active', metric !== 'frequency');
    
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
    if (el.existingProjectsContainer) {
        el.existingProjectsContainer.style.display = 'none';
    }
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
        state.dataViewFilteredCount = data.row_count;
        state.variableCount = data.variable_count;
        state.variables = data.variables;
        state.multiResponseGroups = data.suggested_groups;
        state.selectedVar = null;
        state.isSelectedGroup = false;
        state.currentData = null;
        state.crosstabResults = null;
        
        // Reset Data View State
        state.dataViewPage = 1;
        state.dataViewLoaded = false;
        state.dataViewFilename = null;
        state.dataViewColumns = [];
        state.dataViewRows = [];
        state.showValueLabels = false;
        state.dataViewFilters = {};
        if (el.dataChkValueLabels) el.dataChkValueLabels.checked = false;
        
        // Update UI Dashboard view
        if (el.activeFilenameVar) el.activeFilenameVar.textContent = ' - ' + state.filename;
        if (el.activeFilenameData) el.activeFilenameData.textContent = ' - ' + state.filename;
        el.countVariables.textContent = state.variables.length;
        el.countGroups.textContent = state.multiResponseGroups.length;
        
        // Populate Tree lists & Builder forms
        renderVariableLists();
        populateMultiResponseBuilderCheckboxes();
        populateCrosstabBuilders();
        renderDataDictionaryTable();
        
        // Switch view states
        el.uploadOverlay.style.display = 'none';
        el.headerActions.style.display = 'flex';
        el.headerNav.style.display = 'flex';
        el.mainContent.style.display = 'flex';
        el.noSelectionPlaceholder.style.display = 'flex';
        el.workspaceLayout.style.display = 'none';
        switchNavMenu('variables'); // Reset to variables dictionary view
        
    } catch (e) {
        showModal('Processing Error', e.message);
        // Reset view
        el.dropzone.style.display = 'flex';
        el.loader.style.display = 'none';
        fetchProjectsList(); // Refresh history list
    }
}

// Fetch list of previously uploaded projects
async function fetchProjectsList() {
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('Failed to retrieve project history.');
        const projects = await response.json();
        
        if (projects && projects.length > 0) {
            // Render the list of projects
            el.projectsListBody.innerHTML = projects.map(proj => {
                const dateStr = new Date(proj.upload_time).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 0.45rem 0.5rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;" title="${proj.filename}">
                            ${proj.filename}
                            <div style="font-size: 0.6rem; color: var(--text-muted);">${dateStr}</div>
                        </td>
                        <td style="padding: 0.45rem 0.5rem; color: var(--text-secondary);">${proj.row_count.toLocaleString()}</td>
                        <td style="padding: 0.45rem 0.5rem; text-align: right; display: flex; justify-content: flex-end; gap: 0.35rem;">
                            <button class="btn btn-primary" style="padding: 0.2rem 0.5rem; font-size: 0.65rem;" onclick="loadProject('${proj.id}')">
                                <i data-lucide="play" style="width: 10px; height: 10px; margin-right: 0.15rem;"></i> Load
                            </button>
                            <button class="btn btn-danger" style="padding: 0.2rem 0.5rem; font-size: 0.65rem;" onclick="deleteProject('${proj.id}', '${proj.filename}', event)" title="Delete this dataset history">
                                <i data-lucide="trash-2" style="width: 10px; height: 10px;"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
            
            el.existingProjectsContainer.style.display = 'block';
            lucide.createIcons();
        } else {
            el.existingProjectsContainer.style.display = 'none';
        }
    } catch (e) {
        console.error("Error loading project history:", e);
        el.existingProjectsContainer.style.display = 'none';
    }
}

// Delete a project from database and disk
async function deleteProject(projectId, filename, event) {
    if (event) event.stopPropagation();
    
    const confirmDelete = confirm("Are you sure you want to delete this dataset? This will permanently remove it from the server disk and database history.");
    if (!confirmDelete) return;
    
    try {
        const response = await fetch(`/api/project/${projectId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to delete project');
        }
        
        // Refresh project list
        fetchProjectsList();
        
        // If the deleted project was the active session, reset view and go home
        if (state.filename === filename) {
            state.filename = null;
            state.rowCount = 0;
            state.variableCount = 0;
            state.variables = [];
            state.multiResponseGroups = [];
            goHome();
        }
        
    } catch (e) {
        console.error('Error deleting project:', e);
        showModal('Error', `Failed to delete dataset: ${e.message}`);
    }
}
window.deleteProject = deleteProject;

// Load a specific project by ID
async function loadProject(projectId) {
    el.loader.style.display = 'flex';
    el.dropzone.style.display = 'none';
    el.existingProjectsContainer.style.display = 'none';
    
    try {
        const response = await fetch(`/api/project/load/${projectId}`, {
            method: 'POST'
        });
        if (!response.ok) throw new Error('Failed to load project details.');
        const data = await response.json();
        
        // Update application state
        state.filename = data.filename;
        state.rowCount = data.row_count;
        state.dataViewFilteredCount = data.row_count;
        state.variableCount = data.variable_count;
        state.variables = data.variables;
        state.multiResponseGroups = data.multi_response_groups || [];
        state.selectedVar = null;
        state.isSelectedGroup = false;
        state.currentData = null;
        state.crosstabResults = null;
        
        // Reset Data View State
        state.dataViewPage = 1;
        state.dataViewLoaded = false;
        state.dataViewFilename = null;
        state.dataViewColumns = [];
        state.dataViewRows = [];
        state.showValueLabels = false;
        state.dataViewFilters = {};
        if (el.dataChkValueLabels) el.dataChkValueLabels.checked = false;
        
        // Update UI Dashboard view
        if (el.activeFilenameVar) el.activeFilenameVar.textContent = ' - ' + state.filename;
        if (el.activeFilenameData) el.activeFilenameData.textContent = ' - ' + state.filename;
        el.countVariables.textContent = state.variables.length;
        el.countGroups.textContent = state.multiResponseGroups.length;
        
        // Populate Tree lists & Builder forms
        renderVariableLists();
        populateMultiResponseBuilderCheckboxes();
        populateCrosstabBuilders();
        renderDataDictionaryTable();
        
        // Switch view states
        el.uploadOverlay.style.display = 'none';
        el.headerActions.style.display = 'flex';
        el.headerNav.style.display = 'flex';
        el.mainContent.style.display = 'flex';
        el.noSelectionPlaceholder.style.display = 'flex';
        el.workspaceLayout.style.display = 'none';
        switchNavMenu('variables'); // Reset to variables dictionary view
        
    } catch (e) {
        showModal('Error Loading Project', e.message);
        el.loader.style.display = 'none';
        el.dropzone.style.display = 'flex';
        fetchProjectsList(); // Refresh projects list
    }
}
window.loadProject = loadProject;
// Render Left Sidebar Lists
function renderVariableLists() {
    state.frequenciesLoaded = false;
    
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
                <span class="var-label" title="${group.group_label}"> - ${group.group_label}</span>
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
                <span class="var-label" title="${v.variable_label}"> - ${v.variable_label}</span>
            </div>
        `;
        li.addEventListener('click', () => selectVariableOrGroup(v.variable_name, false));
        el.singleVariablesList.appendChild(li);
    });
    el.countVariables.textContent = state.variables.length;
    
    lucide.createIcons();
    
    // Auto-reload frequencies if currently on the Frequency tab
    const viewFrequency = document.getElementById('view-frequency');
    if (viewFrequency && viewFrequency.style.display === 'flex' && state.filename) {
        loadAllVariableFrequencies();
    }
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

    // Check if frequencies are loaded, if not load them first
    if (!state.frequenciesLoaded || state.frequenciesFilename !== state.filename) {
        await loadAllVariableFrequencies();
    }
    
    // Scroll to the card
    const targetCard = document.getElementById(`freq-card-${id}`);
    if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

async function loadAllVariableFrequencies() {
    if (!state.filename) return;
    
    // Show spinner inside el.freqTablesContainer
    el.freqTablesContainer.innerHTML = `
        <div id="freq-workspace-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; color: var(--text-muted); gap: 0.75rem; min-height: 200px;">
            <i data-lucide="loader-2" class="animate-spin" style="width: 32px; height: 32px; color: var(--accent-violet);"></i>
            <p style="font-size: 0.85rem;">Calculating and loading all variable frequencies...</p>
        </div>
    `;
    lucide.createIcons();
    
    try {
        const response = await fetch('/api/frequencies/all');
        if (!response.ok) throw new Error('Failed to retrieve all variable frequencies.');
        const allFrequencies = await response.json();
        
        if (allFrequencies.length === 0) {
            el.freqTablesContainer.innerHTML = `
                <div id="freq-workspace-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; color: var(--text-muted); padding: 2rem;">
                    <i data-lucide="info" style="width: 32px; height: 32px;"></i>
                    <p style="font-size: 0.8rem; margin-top: 0.5rem;">No variables available in the dataset.</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }
        
        // Render each card inside container
        let htmlContent = '';
        allFrequencies.forEach(data => {
            if (data.is_group) {
                htmlContent += renderGroupFrequencyCard(data);
            } else {
                htmlContent += renderVariableFrequencyCard(data);
            }
        });
        
        el.freqTablesContainer.innerHTML = htmlContent;
        
        state.frequenciesLoaded = true;
        state.frequenciesFilename = state.filename;
        
        // Re-highlight the selected item in the list if one exists
        if (state.selectedVar) {
            const listToSearch = state.isSelectedGroup ? el.multiResponseList : el.singleVariablesList;
            const activeItem = listToSearch.querySelector(`.variable-item[data-id="${state.selectedVar}"]`);
            if (activeItem) {
                activeItem.classList.add('active');
                const targetCard = document.getElementById(`freq-card-${state.selectedVar}`);
                if (targetCard) {
                    targetCard.scrollIntoView({ behavior: 'auto', block: 'start' });
                }
            }
        }
        
    } catch (e) {
        el.freqTablesContainer.innerHTML = `
            <div id="freq-workspace-placeholder" style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; color: var(--text-danger); padding: 2rem; gap: 0.5rem;">
                <i data-lucide="alert-triangle" style="width: 32px; height: 32px;"></i>
                <p style="font-size: 0.85rem; font-weight: bold;">Error Loading Frequencies</p>
                <p style="font-size: 0.75rem; color: var(--text-secondary); max-width: 400px; text-align: center;">${e.message}</p>
            </div>
        `;
    }
    
    lucide.createIcons();
}

function renderGroupFrequencyCard(data) {
    return `
        <div class="card" id="freq-card-${data.group_id}" style="margin-bottom: 0.75rem;">
            <h2 class="card-title" style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                <span class="card-title-left"><i data-lucide="layers" style="color: var(--accent-violet);"></i> Multi-Response Group: ${data.group_name}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: normal; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;" title="${data.group_label || ''}">${data.group_label || ''}</span>
            </h2>
            <div class="table-container">
                <table style="width: 100%;">
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
                </table>
            </div>
        </div>
    `;
}

function renderVariableFrequencyCard(data) {
    return `
        <div class="card" id="freq-card-${data.variable_name}" style="margin-bottom: 0.75rem;">
            <h2 class="card-title" style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
                <span class="card-title-left"><i data-lucide="table" style="color: var(--accent-cyan);"></i> Variable: ${data.variable_name}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary); font-weight: normal; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;" title="${data.variable_label || ''}">${data.variable_label || ''}</span>
            </h2>
            <div class="meta-row-compact" style="display: flex; gap: 1rem; font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 0.5rem; padding: 0 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.02); padding-bottom: 0.4rem;">
                <span><strong>Measurement:</strong> ${data.measurement_level || 'unknown'}</span>
                <span><strong>Type:</strong> ${data.type || 'unknown'}</span>
                <span><strong>Format:</strong> ${data.format || ''}</span>
            </div>
            <div class="table-container">
                <table style="width: 100%;">
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
                </table>
            </div>
        </div>
    `;
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
                <td style="text-align: center; border-right: 1px solid var(--border-color); background: rgba(83, 0, 149, 0.05); font-weight: bold; padding: 0.5rem;">
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
            <td style="text-align: center; font-weight: 800; border-right: 1px solid var(--border-color); background: rgba(83, 0, 149, 0.1); padding: 0.5rem;">
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
        gradientStart: isLight ? 'rgba(83, 0, 149, 0.35)' : 'rgba(83, 0, 149, 0.45)',
        gradientEnd: isLight ? 'rgba(0, 181, 172, 0.01)' : 'rgba(0, 181, 172, 0.05)'
    };
}

// Render dynamic visualization using Chart.js
function renderChart(labels, data, labelText, orientation = 'vertical') {
    if (!el.distributionChart) return;
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
                borderColor: '#530095',
                borderWidth: 1.25,
                borderRadius: 5,
                hoverBackgroundColor: 'rgba(83, 0, 149, 0.75)',
                hoverBorderColor: '#00b5ac',
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

// ==========================================
// DATA DICTIONARY GRID VIEW
// ==========================================

// SVGs for SPSS Variable View Measurements
const nominalSvg = `
<svg class="measure-icon nominal" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="9" cy="15" r="5" fill="#f43f5e" fill-opacity="0.8" stroke="#fff" stroke-width="0.5"/>
  <circle cx="15" cy="15" r="5" fill="#10b981" fill-opacity="0.8" stroke="#fff" stroke-width="0.5"/>
  <circle cx="12" cy="9" r="5" fill="#00b5ac" fill-opacity="0.8" stroke="#fff" stroke-width="0.5"/>
</svg>`;

const ordinalSvg = `
<svg class="measure-icon ordinal" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="14" width="4" height="6" rx="1" fill="#00b5ac" stroke="#fff" stroke-width="0.5"/>
  <rect x="10" y="9" width="4" height="11" rx="1" fill="#f59e0b" stroke="#fff" stroke-width="0.5"/>
  <rect x="15" y="4" width="4" height="16" rx="1" fill="#9a1b15" stroke="#fff" stroke-width="0.5"/>
</svg>`;

const scaleSvg = `
<svg class="measure-icon scale" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 18L18 4" stroke="#f59e0b" stroke-width="3" stroke-linecap="round"/>
  <path d="M7 15L9 17M10 12L12 14M13 9L15 11M16 6L18 8" stroke="#fff" stroke-width="1.2"/>
</svg>`;

// SVGs for Alignment
const alignLeftSvg = `
<svg class="align-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <line x1="3" y1="6" x2="21" y2="6"></line>
  <line x1="3" y1="12" x2="15" y2="12"></line>
  <line x1="3" y1="18" x2="18" y2="18"></line>
</svg>`;

const alignRightSvg = `
<svg class="align-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <line x1="3" y1="6" x2="21" y2="6"></line>
  <line x1="9" y1="12" x2="21" y2="12"></line>
  <line x1="6" y1="18" x2="21" y2="18"></line>
</svg>`;

const alignCenterSvg = `
<svg class="align-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <line x1="3" y1="6" x2="21" y2="6"></line>
  <line x1="6" y1="12" x2="18" y2="12"></line>
  <line x1="5" y1="18" x2="19" y2="18"></line>
</svg>`;

function getMeasureBadge(measure) {
    const level = (measure || 'nominal').toLowerCase();
    let svg = '';
    let label = 'Nominal';
    
    if (level === 'nominal') {
        svg = nominalSvg;
        label = 'Nominal';
    } else if (level === 'ordinal') {
        svg = ordinalSvg;
        label = 'Ordinal';
    } else if (level === 'scale') {
        svg = scaleSvg;
        label = 'Scale';
    } else {
        svg = nominalSvg;
        label = 'Nominal';
    }
    
    return `
        <div class="measure-badge-container" title="${label}">
            ${svg}
            <span class="measure-badge-text" style="font-size: 0.68rem; margin-left: 0.15rem;">${label}</span>
        </div>
    `;
}

function getAlignBadge(align) {
    const val = (align || 'right').toLowerCase();
    let svg = '';
    let label = 'Right';
    if (val === 'left') {
        svg = alignLeftSvg;
        label = 'Left';
    } else if (val === 'center') {
        svg = alignCenterSvg;
        label = 'Center';
    } else {
        svg = alignRightSvg;
        label = 'Right';
    }
    return `
        <div class="align-badge-container" title="${label}">
            ${svg}
            <span style="font-size: 0.68rem; margin-left: 0.15rem;">${label}</span>
        </div>
    `;
}

function renderDataDictionaryTable(filterText = '') {
    const tableBody = document.getElementById('dict-table-body');
    if (!tableBody) return;
    
    const query = filterText.trim().toLowerCase();
    const filteredVars = state.variables.filter(v => {
        const nameMatch = v.variable_name.toLowerCase().includes(query);
        const labelMatch = v.variable_label.toLowerCase().includes(query);
        const formatMatch = (v.spss_type || v.type || '').toLowerCase().includes(query);
        const measureMatch = (v.measurement || v.measurement_level || '').toLowerCase().includes(query);
        const valueLabelsMatch = v.value_labels && v.value_labels.toLowerCase().includes(query);
        return nameMatch || labelMatch || formatMatch || measureMatch || valueLabelsMatch;
    });
    
    tableBody.innerHTML = filteredVars.map((v, index) => {
        const spssType = v.spss_type || (v.type === 'string' || v.type === 'character' ? 'String' : 'Numeric');
        const spssWidth = typeof v.width !== 'undefined' ? v.width : 8;
        const spssDecimals = typeof v.decimals !== 'undefined' ? v.decimals : 0;
        const spssValues = v.values_preview || (v.value_labels ? v.value_labels : 'None');
        const spssMissing = v.missing_values || 'None';
        const spssColumns = v.display_columns || 8;
        const spssAlign = v.alignment || (spssType === 'String' ? 'Left' : 'Right');
        const spssMeasure = v.measurement || (v.measurement_level || 'Nominal');

        const tooltipText = v.value_labels ? v.value_labels.split('; ').join('\n') : 'None';
        const spssValuesDisp = spssValues === 'None' ? '<span style="opacity: 0.5; font-style: normal;">None</span>' : spssValues;

        return `
            <tr>
                <td class="row-num-cell">${index + 1}</td>
                <td style="padding: 0.45rem 0.5rem; color: var(--text-primary);">${v.variable_name}</td>
                <td style="padding: 0.45rem 0.5rem; color: var(--text-secondary);">${spssType}</td>
                <td style="padding: 0.45rem 0.5rem; color: var(--text-secondary); text-align: right;">${spssWidth}</td>
                <td style="padding: 0.45rem 0.5rem; color: var(--text-secondary); text-align: right;">${spssDecimals}</td>
                <td style="padding: 0.45rem 0.5rem; color: var(--text-primary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${v.variable_label || ''}">${v.variable_label || '<span style="opacity: 0.5; font-size: 0.65rem; font-style: normal;">No Label</span>'}</td>
                <td style="padding: 0.45rem 0.5rem; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${tooltipText}">${spssValuesDisp}</td>
                <td style="padding: 0.45rem 0.5rem; color: var(--text-muted);">${spssMissing}</td>
                <td style="padding: 0.45rem 0.5rem; color: var(--text-secondary); text-align: right;">${spssColumns}</td>
                <td style="padding: 0.45rem 0.5rem;">${getAlignBadge(spssAlign)}</td>
                <td style="padding: 0.45rem 0.5rem;">${getMeasureBadge(spssMeasure)}</td>
            </tr>
        `;
    }).join('');
    
    if (filteredVars.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="11" style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
                    No matching variables found.
                </td>
            </tr>
        `;
    }
}

// ==========================================
// DATA VIEW GRID VIEW
// ==========================================

function getValueLabel(varName, value) {
    if (value === null || value === undefined || value === "") return "";
    const variable = state.variables.find(v => v.variable_name === varName);
    if (!variable || !variable.value_labels_dict) return value;
    
    const dict = variable.value_labels_dict;
    
    // Parse value to float for comparisons
    const valNum = parseFloat(value);
    const hasNum = !isNaN(valNum);
    
    // Loop over the keys to find equivalent values
    for (const key of Object.keys(dict)) {
        // Direct string match
        if (key === String(value)) {
            return dict[key];
        }
        
        // Float conversion match to handle keys like "1.0" matching value 1
        const keyNum = parseFloat(key);
        if (!isNaN(keyNum) && hasNum) {
            if (Math.abs(keyNum - valNum) < 1e-9) {
                return dict[key];
            }
        }
    }
    
    return value;
}

async function loadDataView(page = 1) {
    if (!state.filename) return;
    
    el.loader.style.display = 'flex';
    try {
        const filtersStr = JSON.stringify(state.dataViewFilters);
        const response = await fetch(`/api/data/view?page=${page}&page_size=${state.dataViewPageSize}&filters=${encodeURIComponent(filtersStr)}`);
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to fetch dataset records');
        }
        
        const res = await response.json();
        
        state.dataViewPage = res.page;
        state.dataViewColumns = res.columns;
        state.dataViewRows = res.data;
        state.dataViewFilteredCount = res.total_cases;
        state.dataViewLoaded = true;
        state.dataViewFilename = state.filename;
        
        renderDataViewTable();
        
    } catch (e) {
        showModal('Error Loading Data View', e.message);
    } finally {
        el.loader.style.display = 'none';
    }
}

function renderDataViewTable() {
    if (!el.dataTableHeader || !el.dataTableBody) return;
    
    // Render columns header with funnel buttons
    let headerHtml = `<tr style="border-bottom: 2px solid var(--border-color); background: var(--bg-base);">`;
    headerHtml += `<th class="row-num-header"></th>`; // Leftmost row index header cell
    
    state.dataViewColumns.forEach(col => {
        const isFiltered = state.dataViewFilters[col] && state.dataViewFilters[col].length > 0;
        const btnStyle = isFiltered ? 'color: var(--accent-cyan); font-weight: bold;' : 'color: var(--text-muted); opacity: 0.7;';
        headerHtml += `
            <th data-col-header="${col}" style="padding: 0.45rem 0.5rem; color: var(--text-primary); min-width: 110px; vertical-align: middle; user-select: none;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.35rem; font-weight: normal;">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${col}">${col}</span>
                    <button class="col-filter-trigger-btn" data-col="${col}" style="background: transparent; border: none; outline: none; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0.15rem; border-radius: 3px; ${btnStyle}" title="Filter ${col}">
                        <svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 11px; height: 11px;">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                        </svg>
                    </button>
                </div>
            </th>
        `;
    });
    headerHtml += `</tr>`;
    el.dataTableHeader.innerHTML = headerHtml;
    
    // Render rows
    if (state.dataViewRows.length === 0) {
        const colCount = state.dataViewColumns.length + 1;
        el.dataTableBody.innerHTML = `
            <tr>
                <td colspan="${colCount}" style="padding: 1.5rem; text-align: center; color: var(--text-muted);">
                    No cases found.
                </td>
            </tr>
        `;
        return;
    }
    
    const startNum = (state.dataViewPage - 1) * state.dataViewPageSize;
    
    let rowsHtml = '';
    state.dataViewRows.forEach((row, index) => {
        rowsHtml += `<tr>`;
        rowsHtml += `<td class="row-num-cell">${startNum + index + 1}</td>`;
        
        state.dataViewColumns.forEach(col => {
            const val = row[col];
            // Format value
            let displayVal = val;
            if (state.showValueLabels) {
                displayVal = getValueLabel(col, val);
            }
            
            // Output full string to let CSS handle truncation, always show full value as tooltip
            const dispStr = String(displayVal);
            const cellTitle = dispStr;
            
            // Format aligning to match type
            const variable = state.variables.find(v => v.variable_name === col);
            const spssType = variable ? variable.spss_type : 'Numeric';
            const alignStyle = spssType === 'String' ? 'text-align: left;' : 'text-align: right;';
            
            rowsHtml += `<td style="color: var(--text-secondary); ${alignStyle}" title="${cellTitle}">${dispStr}</td>`;
        });
        
        rowsHtml += `</tr>`;
    });
    
    el.dataTableBody.innerHTML = rowsHtml;
    
    // Update pagination labels
    const maxPage = Math.ceil(state.dataViewFilteredCount / state.dataViewPageSize) || 1;
    el.dataPaginationInfo.textContent = `Page ${state.dataViewPage} of ${maxPage}`;
    
    // Toggle state of prev/next buttons
    el.dataBtnPrev.disabled = state.dataViewPage <= 1;
    el.dataBtnNext.disabled = state.dataViewPage >= maxPage;

    // Toggle state of Clear Filters button
    if (el.btnClearDataFilters) {
        const hasFilters = Object.keys(state.dataViewFilters).length > 0;
        el.btnClearDataFilters.style.display = hasFilters ? 'inline-flex' : 'none';
    }

    // Update the badge text and visibility
    if (el.dataRecordCountBadge) {
        el.dataRecordCountBadge.style.display = 'inline-block';
        if (state.dataViewFilteredCount === state.rowCount) {
            el.dataRecordCountBadge.textContent = `Total: ${state.rowCount.toLocaleString()}`;
        } else {
            el.dataRecordCountBadge.textContent = `Filtered: ${state.dataViewFilteredCount.toLocaleString()} of ${state.rowCount.toLocaleString()}`;
        }
    }
}

let activeFilterColumn = null;

// Show column filter dropdown near the trigger button
async function openColumnFilterDropdown(colName, triggerElement) {
    const dropdown = document.getElementById('col-filter-dropdown');
    if (!dropdown) return;
    
    activeFilterColumn = colName;
    
    // Position dropdown near the button
    const rect = triggerElement.getBoundingClientRect();
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    dropdown.style.left = `${rect.left + scrollLeft}px`;
    dropdown.style.top = `${rect.bottom + scrollTop + 4}px`;
    dropdown.style.display = 'flex';
    
    // Clear search and option list
    const searchInput = document.getElementById('filter-dropdown-search');
    searchInput.value = '';
    
    const listContainer = document.getElementById('filter-dropdown-list');
    listContainer.innerHTML = `<div style="padding: 0.5rem; text-align: center; color: var(--text-muted); font-size: 0.65rem;">Loading unique values...</div>`;
    
    try {
        const response = await fetch(`/api/data/column-values?column=${encodeURIComponent(colName)}`);
        if (!response.ok) throw new Error('Failed to fetch column values');
        const res = await response.json();
        
        const uniqueValues = res.values;
        const currentFilters = state.dataViewFilters[colName] || [];
        const isFiltered = currentFilters.length > 0;
        
        let listHtml = '';
        
        // "Select All" checkbox
        const selectAllChecked = !isFiltered || currentFilters.length === uniqueValues.length;
        listHtml += `
            <label class="filter-dropdown-item select-all-item" style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer; padding: 0.15rem 0.25rem; user-select: none; border-bottom: 1px solid var(--border-color); margin-bottom: 0.25rem; padding-bottom: 0.25rem;">
                <input type="checkbox" id="filter-opt-select-all" ${selectAllChecked ? 'checked' : ''} style="cursor: pointer; accent-color: var(--accent-violet);">
                <span style="font-size: 0.68rem; color: var(--text-primary); font-family: monospace;">(Select All)</span>
            </label>
        `;
        
        // Loop values
        uniqueValues.forEach(item => {
            const isChecked = !isFiltered || currentFilters.some(f => String(f) === String(item.value));
            const displayLabel = item.label !== String(item.value) ? `${item.label} (${item.value})` : item.label;
            
            listHtml += `
                <label class="filter-dropdown-item" style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer; padding: 0.15rem 0.25rem; user-select: none;">
                    <input type="checkbox" class="filter-opt-chk" value="${item.value}" ${isChecked ? 'checked' : ''} style="cursor: pointer; accent-color: var(--accent-violet);">
                    <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: 0.68rem; color: var(--text-secondary);" title="${displayLabel}">${displayLabel}</span>
                </label>
            `;
        });
        
        listContainer.innerHTML = listHtml;
        setupCheckboxHandlers();
        
        // Focus search input
        searchInput.focus();
        
    } catch (e) {
        listContainer.innerHTML = `<div style="padding: 0.5rem; text-align: center; color: var(--accent-rose); font-size: 0.65rem;">Error: ${e.message}</div>`;
    }
}

function setupCheckboxHandlers() {
    const selectAllChk = document.getElementById('filter-opt-select-all');
    const chks = document.querySelectorAll('.filter-opt-chk');
    
    if (selectAllChk) {
        selectAllChk.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            chks.forEach(chk => {
                const parentRow = chk.closest('.filter-dropdown-item');
                // Only change visible option checkboxes inside search filter matching options
                if (parentRow && parentRow.style.display !== 'none') {
                    chk.checked = isChecked;
                }
            });
        });
        
        chks.forEach(chk => {
            chk.addEventListener('change', () => {
                const allChecked = Array.from(chks).every(c => c.checked);
                selectAllChk.checked = allChecked;
            });
        });
    }
}

// Bind dropdown triggers on table header using event delegation
if (el.dataTableHeader && !el.dataTableHeader.dataset.listenerBound) {
    el.dataTableHeader.dataset.listenerBound = 'true';
    el.dataTableHeader.addEventListener('click', (e) => {
        const btn = e.target.closest('.col-filter-trigger-btn');
        if (btn) {
            const colName = btn.getAttribute('data-col');
            openColumnFilterDropdown(colName, btn);
        }
    });
}

// Set up global static filter dropdown event bindings
document.addEventListener('DOMContentLoaded', () => {
    // Dropdown search input text filtering
    const searchInput = document.getElementById('filter-dropdown-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase().trim();
            const items = document.querySelectorAll('.filter-dropdown-item');
            items.forEach(item => {
                if (item.classList.contains('select-all-item')) return;
                const text = item.textContent.toLowerCase();
                if (text.includes(query)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }
    
    // Dropdown cancel button
    const btnCancel = document.getElementById('filter-dropdown-btn-cancel');
    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            const dropdown = document.getElementById('col-filter-dropdown');
            if (dropdown) dropdown.style.display = 'none';
        });
    }
    
    // Dropdown OK/Apply button
    const btnOk = document.getElementById('filter-dropdown-btn-ok');
    if (btnOk) {
        btnOk.addEventListener('click', () => {
            const dropdown = document.getElementById('col-filter-dropdown');
            if (!dropdown || !activeFilterColumn) return;
            
            const chks = document.querySelectorAll('.filter-opt-chk');
            const selectAllChk = document.getElementById('filter-opt-select-all');
            
            // If select all checkbox is checked, no filter is applied (default state)
            const allChecked = selectAllChk ? selectAllChk.checked : Array.from(chks).every(c => c.checked);
            
            if (allChecked) {
                delete state.dataViewFilters[activeFilterColumn];
            } else {
                const checkedValues = Array.from(chks)
                    .filter(c => c.checked)
                    .map(c => c.value);
                state.dataViewFilters[activeFilterColumn] = checkedValues;
            }
            
            dropdown.style.display = 'none';
            loadDataView(1); // Reload data view on page 1
        });
    }
    
    // Outside click to dismiss overlay dropdown
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('col-filter-dropdown');
        if (dropdown && dropdown.style.display !== 'none') {
            const isClickInside = dropdown.contains(e.target);
            const isClickTrigger = e.target.closest('.col-filter-trigger-btn');
            if (!isClickInside && !isClickTrigger) {
                dropdown.style.display = 'none';
            }
        }

        const jumpDropdown = document.getElementById('data-column-jump-dropdown');
        if (jumpDropdown && jumpDropdown.style.display !== 'none') {
            const isClickInside = jumpDropdown.contains(e.target);
            const isClickTrigger = e.target.closest('#btn-data-column-jump') || e.target.closest('.column-jump-item');
            if (!isClickInside && !isClickTrigger) {
                jumpDropdown.style.display = 'none';
            }
        }
    });
});

// Toggle/Open column jumper dropdown
function toggleColumnJumpDropdown() {
    if (!el.dataColumnJumpDropdown) return;
    
    const isShowing = el.dataColumnJumpDropdown.style.display === 'flex';
    if (isShowing) {
        el.dataColumnJumpDropdown.style.display = 'none';
    } else {
        el.dataColumnJumpDropdown.style.display = 'flex';
        el.dataColumnJumpSearch.value = '';
        renderColumnJumpList();
        el.dataColumnJumpSearch.focus();
    }
}

// Render searchable column list
function renderColumnJumpList(query = '') {
    if (!el.dataColumnJumpList) return;
    
    const q = query.trim().toLowerCase();
    
    let html = '';
    state.dataViewColumns.forEach(col => {
        const variable = state.variables.find(v => v.variable_name === col);
        const label = variable ? variable.variable_label : '';
        
        if (q && !col.toLowerCase().includes(q) && !label.toLowerCase().includes(q)) {
            return; // Filtered out by search query
        }
        
        const isFiltered = state.dataViewFilters[col] && state.dataViewFilters[col].length > 0;
        const filterIcon = isFiltered 
            ? `<svg class="filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 11px; height: 11px; color: var(--accent-cyan); flex-shrink: 0; margin-left: 0.25rem;"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>`
            : '';
            
        html += `
            <div class="column-jump-item" data-col-name="${col}" style="display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; flex-direction: column; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px;">
                    <span style="font-family: monospace; font-size: 0.72rem; font-weight: bold; color: var(--accent-cyan);">${col}</span>
                    <span style="font-size: 0.65rem; color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; overflow: hidden;" title="${label || ''}">${label || '<span style="opacity:0.5; font-style:normal;">No Label</span>'}</span>
                </div>
                ${filterIcon}
            </div>
        `;
    });
    
    if (!html) {
        html = `<div style="padding: 0.5rem; text-align: center; color: var(--text-muted); font-size: 0.68rem;">No matching variables</div>`;
    }
    
    el.dataColumnJumpList.innerHTML = html;
    
    // Bind click events on items
    el.dataColumnJumpList.querySelectorAll('.column-jump-item').forEach(item => {
        item.addEventListener('click', () => {
            const colName = item.getAttribute('data-col-name');
            el.dataColumnJumpDropdown.style.display = 'none';
            jumpToColumn(colName);
        });
    });
}

// Scroll to, highlight and open filter dropdown for a column
function jumpToColumn(colName) {
    if (!el.dataTableHeader) return;
    
    const th = el.dataTableHeader.querySelector(`[data-col-header="${colName}"]`);
    if (!th) return;
    
    // 1. Scroll header element into view smoothly
    th.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    
    // 2. Flash-highlight animation
    th.classList.remove('column-highlight');
    void th.offsetWidth; // Force layout recalculation to reset animation
    th.classList.add('column-highlight');
    setTimeout(() => {
        th.classList.remove('column-highlight');
    }, 2000);
    
    // 3. Automatically open filter dialog
    const triggerBtn = th.querySelector('.col-filter-trigger-btn');
    if (triggerBtn) {
        // A short delay to allow the scroll to complete before positioning dropdown overlay
        setTimeout(() => {
            openColumnFilterDropdown(colName, triggerBtn);
        }, 300);
    }
}


// ==========================================
// VARIABLE/LABEL RENAMING MODAL & ACTIONS
// ==========================================
let renameVarActiveTab = 'single';
let renameBulkNamesMap = {};

let renameLabelActiveTab = 'single';
let renameLabelBulkMap = {};

function setupRenameEventListeners() {
    // 1. Variable Rename Modal triggers
    const btnRenameVar = document.getElementById('btn-rename-var-card');
    if (btnRenameVar) {
        btnRenameVar.addEventListener('click', openRenameVarModal);
    }
    
    // Select variable change listener for populating fields in Single tab
    const selectVar = document.getElementById('rename-var-select');
    if (selectVar) {
        selectVar.addEventListener('change', (e) => {
            const varName = e.target.value;
            const newNameInput = document.getElementById('rename-var-new-name');
            if (varName) {
                const found = state.variables.find(v => v.variable_name === varName);
                if (found) {
                    if (newNameInput) newNameInput.value = found.variable_name;
                }
            } else {
                if (newNameInput) newNameInput.value = '';
            }
        });
    }
    
    // Dropzone for Bulk Names
    const namesDropzone = document.getElementById('rename-bulk-names-dropzone');
    const namesFileInput = document.getElementById('rename-bulk-names-file-input');
    if (namesDropzone && namesFileInput) {
        namesDropzone.addEventListener('click', () => namesFileInput.click());
        namesDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            namesDropzone.classList.add('dragover');
        });
        namesDropzone.addEventListener('dragleave', () => {
            namesDropzone.classList.remove('dragover');
        });
        namesDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            namesDropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleRenameBulkNamesFile(e.dataTransfer.files[0]);
            }
        });
        namesFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleRenameBulkNamesFile(e.target.files[0]);
            }
        });
    }
    
    // 2. Label Rename Modal triggers
    const btnRenameLabel = document.getElementById('btn-rename-label-card');
    if (btnRenameLabel) {
        btnRenameLabel.addEventListener('click', openRenameLabelModal);
    }
    
    // Select variable change listener for populating label field in Single label tab
    const selectLabel = document.getElementById('rename-label-var-select');
    if (selectLabel) {
        selectLabel.addEventListener('change', (e) => {
            const varName = e.target.value;
            const newLabelInput = document.getElementById('rename-label-new-label');
            if (varName) {
                const found = state.variables.find(v => v.variable_name === varName);
                if (found) {
                    if (newLabelInput) newLabelInput.value = found.variable_label || '';
                }
            } else {
                if (newLabelInput) newLabelInput.value = '';
            }
        });
    }
    
    // Dropzone for Bulk Labels
    const labelsDropzone = document.getElementById('rename-bulk-labels-dropzone');
    const labelsFileInput = document.getElementById('rename-bulk-labels-file-input');
    if (labelsDropzone && labelsFileInput) {
        labelsDropzone.addEventListener('click', () => labelsFileInput.click());
        labelsDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            labelsDropzone.classList.add('dragover');
        });
        labelsDropzone.addEventListener('dragleave', () => {
            labelsDropzone.classList.remove('dragover');
        });
        labelsDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            labelsDropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleRenameBulkLabelsFile(e.dataTransfer.files[0]);
            }
        });
        labelsFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleRenameBulkLabelsFile(e.target.files[0]);
            }
        });
    }

    // 3. SPSS Syntax Execution Modal triggers
    const btnExecuteSyntaxCard = document.getElementById('btn-execute-syntax-card');
    if (btnExecuteSyntaxCard) {
        btnExecuteSyntaxCard.addEventListener('click', openExecuteSyntaxModal);
    }

    const syntaxDropzone = document.getElementById('execute-syntax-dropzone');
    const syntaxFileInput = document.getElementById('execute-syntax-file-input');
    if (syntaxDropzone && syntaxFileInput) {
        syntaxDropzone.addEventListener('click', () => syntaxFileInput.click());
        syntaxDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            syntaxDropzone.classList.add('dragover');
        });
        syntaxDropzone.addEventListener('dragleave', () => {
            syntaxDropzone.classList.remove('dragover');
        });
        syntaxDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            syntaxDropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleExecuteSyntaxFile(e.dataTransfer.files[0]);
            }
        });
        syntaxFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleExecuteSyntaxFile(e.target.files[0]);
            }
        });
    }

    const syntaxCodeInput = document.getElementById('syntax-code-input');
    if (syntaxCodeInput) {
        // Sync backdrop text and coordinates on input
        syntaxCodeInput.addEventListener('input', (e) => {
            updateEditorBackdrop();
            const translated = translateSpssToPandas(e.target.value);
            const previewEl = document.getElementById('syntax-pandas-preview');
            if (previewEl) {
                previewEl.textContent = translated;
            }
            handleAutocompleteTrigger(e.target);
        });

        // Sync scroll movements
        syntaxCodeInput.addEventListener('scroll', (e) => {
            const backdrop = document.getElementById('syntax-code-backdrop');
            if (backdrop) {
                backdrop.scrollTop = e.target.scrollTop;
                backdrop.scrollLeft = e.target.scrollLeft;
            }
        });

        // Key bindings for suggestions navigation
        syntaxCodeInput.addEventListener('keydown', (e) => {
            handleEditorKeydown(e, e.target);
        });

        // Close suggestions dropdown when focus is lost
        syntaxCodeInput.addEventListener('blur', () => {
            // A short timeout is needed so mouse click selections can be registered
            setTimeout(hideAutocomplete, 200);
        });
    }

    const btnExecuteSyntaxRun = document.getElementById('btn-execute-syntax-run');
    if (btnExecuteSyntaxRun) {
        btnExecuteSyntaxRun.addEventListener('click', runSpssSyntaxExecution);
    }
}

// Variable renaming modal show / hide / save
function openRenameVarModal() {
    if (!state.variables || state.variables.length === 0) {
        showModal('Error', 'No active variables in dataset to rename.');
        return;
    }
    
    clearRenameVarError();
    
    renameVarActiveTab = 'single';
    renameBulkNamesMap = {};
    
    switchRenameTab('single');
    
    const namesFileInput = document.getElementById('rename-bulk-names-file-input');
    if (namesFileInput) namesFileInput.value = '';
    const namesFileStatus = document.getElementById('rename-bulk-names-file-status');
    if (namesFileStatus) namesFileStatus.style.display = 'none';
    
    const select = document.getElementById('rename-var-select');
    if (select) {
        select.innerHTML = '<option value="">-- Select Variable --</option>' + 
            state.variables.map(v => `<option value="${v.variable_name}">${v.variable_name}${v.variable_label ? ' (' + v.variable_label + ')' : ''}</option>`).join('');
        select.value = '';
    }
    
    const newNameInput = document.getElementById('rename-var-new-name');
    if (newNameInput) newNameInput.value = '';
    
    const modal = document.getElementById('modal-rename-var');
    if (modal) modal.classList.add('active');
}
window.openRenameVarModal = openRenameVarModal;

function closeRenameVarModal() {
    const modal = document.getElementById('modal-rename-var');
    if (modal) modal.classList.remove('active');
}
window.closeRenameVarModal = closeRenameVarModal;

function switchRenameTab(tabId) {
    renameVarActiveTab = tabId;
    clearRenameVarError();
    
    const btnSingle = document.getElementById('rename-tab-btn-single');
    const btnNames = document.getElementById('rename-tab-btn-bulk-names');
    
    const contentSingle = document.getElementById('rename-tab-content-single');
    const contentNames = document.getElementById('rename-tab-content-bulk-names');
    
    if (btnSingle) btnSingle.classList.toggle('active', tabId === 'single');
    if (btnNames) btnNames.classList.toggle('active', tabId === 'bulk_names');
    
    if (btnSingle) btnSingle.style.borderBottom = tabId === 'single' ? '2px solid var(--accent-violet)' : '2px solid transparent';
    if (btnNames) btnNames.style.borderBottom = tabId === 'bulk_names' ? '2px solid var(--accent-violet)' : '2px solid transparent';
    
    if (btnSingle) btnSingle.style.color = tabId === 'single' ? 'var(--text-primary)' : 'var(--text-muted)';
    if (btnNames) btnNames.style.color = tabId === 'bulk_names' ? 'var(--text-primary)' : 'var(--text-muted)';
    
    if (contentSingle) contentSingle.style.display = tabId === 'single' ? 'flex' : 'none';
    if (contentNames) contentNames.style.display = tabId === 'bulk_names' ? 'flex' : 'none';
}
window.switchRenameTab = switchRenameTab;

function showRenameVarError(msg) {
    const errContainer = document.getElementById('rename-vars-step-error');
    const errMsg = document.getElementById('rename-vars-step-error-msg');
    if (errContainer && errMsg) {
        errMsg.textContent = msg;
        errContainer.style.display = 'flex';
    }
}
window.showRenameVarError = showRenameVarError;

function clearRenameVarError() {
    const errContainer = document.getElementById('rename-vars-step-error');
    if (errContainer) {
        errContainer.style.display = 'none';
    }
}
window.clearRenameVarError = clearRenameVarError;

function handleRenameBulkNamesFile(file) {
    if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
        showRenameVarError('Please upload a plain text (.txt) file.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        
        if (lines.length === 0) {
            showRenameVarError('The uploaded file is empty.');
            return;
        }
        
        const activeVarsMap = {};
        state.variables.forEach(v => {
            activeVarsMap[v.variable_name.toLowerCase()] = v.variable_name;
        });
        
        const tempMap = {};
        const newNamesSet = new Set();
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const parts = line.split('=');
            if (parts.length !== 2) {
                showRenameVarError(`Line ${i + 1} has invalid format. Must be old_name = new_name.`);
                return;
            }
            
            const oldNameRaw = parts[0].trim();
            const newNameRaw = parts[1].trim();
            
            if (!oldNameRaw || !newNameRaw) {
                showRenameVarError(`Line ${i + 1} contains empty variable name.`);
                return;
            }
            
            const oldNameLower = oldNameRaw.toLowerCase();
            if (!activeVarsMap[oldNameLower]) {
                showRenameVarError(`Variable "${oldNameRaw}" at line ${i + 1} does not exist in the current dataset.`);
                return;
            }
            
            const resolvedOldName = activeVarsMap[oldNameLower];
            
            // Validate new name format: alphanumeric + underscore, starts with letter, max 64 chars
            const varNameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
            if (!varNameRegex.test(newNameRaw) || newNameRaw.length > 64) {
                showRenameVarError(`Invalid new variable name "${newNameRaw}" at line ${i + 1}. Must start with a letter and contain only alphanumeric/underscores, max 64 characters.`);
                return;
            }
            
            if (newNamesSet.has(newNameRaw.toLowerCase())) {
                showRenameVarError(`Duplicate target variable name "${newNameRaw}" in upload file.`);
                return;
            }
            newNamesSet.add(newNameRaw.toLowerCase());
            
            tempMap[resolvedOldName] = newNameRaw;
        }
        
        // Check collision with non-renamed existing variables
        for (const [oldName, newName] of Object.entries(tempMap)) {
            const newNameLower = newName.toLowerCase();
            if (activeVarsMap[newNameLower] && !tempMap[activeVarsMap[newNameLower]]) {
                showRenameVarError(`Target variable name "${newName}" already exists in the dataset.`);
                return;
            }
        }
        
        clearRenameVarError();
        renameBulkNamesMap = tempMap;
        
        const fileNameText = document.getElementById('rename-bulk-names-file-name-text');
        const fileStatus = document.getElementById('rename-bulk-names-file-status');
        if (fileNameText) {
            fileNameText.textContent = `${file.name} (${Object.keys(tempMap).length} renames parsed)`;
        }
        if (fileStatus) {
            fileStatus.style.display = 'flex';
        }
    };
    reader.readAsText(file);
}

async function executeVariableRename() {
    clearRenameVarError();
    
    let payload = {
        mode: renameVarActiveTab
    };
    
    if (renameVarActiveTab === 'single') {
        const select = document.getElementById('rename-var-select');
        const newNameInput = document.getElementById('rename-var-new-name');
        
        const varName = select ? select.value : '';
        const newName = newNameInput ? newNameInput.value.trim() : '';
        
        if (!varName) {
            showRenameVarError('Please select a variable.');
            return;
        }
        if (!newName) {
            showRenameVarError('Please enter a new name.');
            return;
        }
        
        const varNameRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
        if (!varNameRegex.test(newName) || newName.length > 64) {
            showRenameVarError('Invalid variable name. Must start with a letter and contain only alphanumeric characters and underscores, max 64 characters.');
            return;
        }
        
        payload.variable = varName;
        payload.new_name = newName;
        payload.new_label = null;
        
    } else if (renameVarActiveTab === 'bulk_names') {
        if (!renameBulkNamesMap || Object.keys(renameBulkNamesMap).length === 0) {
            showRenameVarError('Please upload and parse a valid bulk names file.');
            return;
        }
        payload.renames = renameBulkNamesMap;
    }
    
    const btnSave = document.getElementById('btn-rename-var-save');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving Changes...';
    }
    
    try {
        const response = await fetch('/api/variables/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to rename variables.');
        }
        
        const data = await response.json();
        
        state.variables = data.dictionary;
        
        if (payload.mode === 'single') {
            const oldName = payload.variable;
            const newName = payload.new_name;
            state.multiResponseGroups.forEach(group => {
                group.variables = group.variables.map(v => v === oldName ? newName : v);
            });
        } else if (payload.mode === 'bulk_names') {
            const renameMap = payload.renames;
            state.multiResponseGroups.forEach(group => {
                group.variables = group.variables.map(v => renameMap[v] !== undefined ? renameMap[v] : v);
            });
        }
        
        state.dataViewLoaded = false;
        state.dataViewFilename = null;
        state.dataViewColumns = [];
        state.dataViewRows = [];
        
        renderVariableLists();
        populateMultiResponseBuilderCheckboxes();
        populateCrosstabBuilders();
        renderDataDictionaryTable();
        
        closeRenameVarModal();
        showModal('Success', 'Variables renamed successfully.');
        
    } catch (e) {
        showRenameVarError(e.message);
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Save Changes';
        }
    }
}
window.executeVariableRename = executeVariableRename;


// Label renaming modal show / hide / save
function openRenameLabelModal() {
    if (!state.variables || state.variables.length === 0) {
        showModal('Error', 'No active variables in dataset to modify labels.');
        return;
    }
    
    clearRenameLabelError();
    
    renameLabelActiveTab = 'single';
    renameLabelBulkMap = {};
    
    switchRenameLabelTab('single');
    
    const labelsFileInput = document.getElementById('rename-bulk-labels-file-input');
    if (labelsFileInput) labelsFileInput.value = '';
    const labelsFileStatus = document.getElementById('rename-bulk-labels-file-status');
    if (labelsFileStatus) labelsFileStatus.style.display = 'none';
    
    const select = document.getElementById('rename-label-var-select');
    if (select) {
        select.innerHTML = '<option value="">-- Select Variable --</option>' + 
            state.variables.map(v => `<option value="${v.variable_name}">${v.variable_name}${v.variable_label ? ' (' + v.variable_label + ')' : ''}</option>`).join('');
        select.value = '';
    }
    
    const newLabelInput = document.getElementById('rename-label-new-label');
    if (newLabelInput) newLabelInput.value = '';
    
    const modal = document.getElementById('modal-rename-label');
    if (modal) modal.classList.add('active');
}
window.openRenameLabelModal = openRenameLabelModal;

function closeRenameLabelModal() {
    const modal = document.getElementById('modal-rename-label');
    if (modal) modal.classList.remove('active');
}
window.closeRenameLabelModal = closeRenameLabelModal;

function switchRenameLabelTab(tabId) {
    renameLabelActiveTab = tabId;
    clearRenameLabelError();
    
    const btnSingle = document.getElementById('rename-label-tab-btn-single');
    const btnLabels = document.getElementById('rename-label-tab-btn-bulk-labels');
    
    const contentSingle = document.getElementById('rename-label-tab-content-single');
    const contentLabels = document.getElementById('rename-label-tab-content-bulk-labels');
    
    if (btnSingle) btnSingle.classList.toggle('active', tabId === 'single');
    if (btnLabels) btnLabels.classList.toggle('active', tabId === 'bulk_labels');
    
    if (btnSingle) btnSingle.style.borderBottom = tabId === 'single' ? '2px solid var(--accent-violet)' : '2px solid transparent';
    if (btnLabels) btnLabels.style.borderBottom = tabId === 'bulk_labels' ? '2px solid var(--accent-violet)' : '2px solid transparent';
    
    if (btnSingle) btnSingle.style.color = tabId === 'single' ? 'var(--text-primary)' : 'var(--text-muted)';
    if (btnLabels) btnLabels.style.color = tabId === 'bulk_labels' ? 'var(--text-primary)' : 'var(--text-muted)';
    
    if (contentSingle) contentSingle.style.display = tabId === 'single' ? 'flex' : 'none';
    if (contentLabels) contentLabels.style.display = tabId === 'bulk_labels' ? 'flex' : 'none';
}
window.switchRenameLabelTab = switchRenameLabelTab;

function showRenameLabelError(msg) {
    const errContainer = document.getElementById('rename-label-step-error');
    const errMsg = document.getElementById('rename-label-step-error-msg');
    if (errContainer && errMsg) {
        errMsg.textContent = msg;
        errContainer.style.display = 'flex';
    }
}
window.showRenameLabelError = showRenameLabelError;

function clearRenameLabelError() {
    const errContainer = document.getElementById('rename-label-step-error');
    if (errContainer) {
        errContainer.style.display = 'none';
    }
}
window.clearRenameLabelError = clearRenameLabelError;

function handleRenameBulkLabelsFile(file) {
    if (file.type !== 'text/plain' && !file.name.endsWith('.txt')) {
        showRenameLabelError('Please upload a plain text (.txt) file.');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        
        if (lines.length === 0) {
            showRenameLabelError('The uploaded file is empty.');
            return;
        }
        
        const activeVarsMap = {};
        state.variables.forEach(v => {
            activeVarsMap[v.variable_name.toLowerCase()] = v.variable_name;
        });
        
        const tempMap = {};
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const eqIndex = line.indexOf('=');
            if (eqIndex === -1) {
                showRenameLabelError(`Line ${i + 1} has invalid format. Must be variable_name = new_label.`);
                return;
            }
            
            const varNameRaw = line.substring(0, eqIndex).trim();
            const labelRaw = line.substring(eqIndex + 1).trim();
            
            if (!varNameRaw) {
                showRenameLabelError(`Line ${i + 1} contains empty variable name.`);
                return;
            }
            
            const varNameLower = varNameRaw.toLowerCase();
            if (!activeVarsMap[varNameLower]) {
                showRenameLabelError(`Variable "${varNameRaw}" at line ${i + 1} does not exist in the current dataset.`);
                return;
            }
            
            const resolvedVarName = activeVarsMap[varNameLower];
            tempMap[resolvedVarName] = labelRaw;
        }
        
        clearRenameLabelError();
        renameLabelBulkMap = tempMap;
        
        const fileNameText = document.getElementById('rename-bulk-labels-file-name-text');
        const fileStatus = document.getElementById('rename-bulk-labels-file-status');
        if (fileNameText) {
            fileNameText.textContent = `${file.name} (${Object.keys(tempMap).length} labels parsed)`;
        }
        if (fileStatus) {
            fileStatus.style.display = 'flex';
        }
    };
    reader.readAsText(file);
}

async function executeVariableLabelRename() {
    clearRenameLabelError();
    
    let payload = {
        mode: 'bulk_labels',
        labels: {}
    };
    
    if (renameLabelActiveTab === 'single') {
        const select = document.getElementById('rename-label-var-select');
        const newLabelInput = document.getElementById('rename-label-new-label');
        
        const varName = select ? select.value : '';
        const newLabel = newLabelInput ? newLabelInput.value.trim() : '';
        
        if (!varName) {
            showRenameLabelError('Please select a variable.');
            return;
        }
        
        payload.labels[varName] = newLabel;
        
    } else if (renameLabelActiveTab === 'bulk_labels') {
        if (!renameLabelBulkMap || Object.keys(renameLabelBulkMap).length === 0) {
            showRenameLabelError('Please upload and parse a valid bulk labels file.');
            return;
        }
        payload.labels = renameLabelBulkMap;
    }
    
    const btnSave = document.getElementById('btn-rename-label-save');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving Changes...';
    }
    
    try {
        const response = await fetch('/api/variables/rename', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to rename labels.');
        }
        
        const data = await response.json();
        
        state.variables = data.dictionary;
        
        state.dataViewLoaded = false;
        state.dataViewFilename = null;
        state.dataViewColumns = [];
        state.dataViewRows = [];
        
        renderVariableLists();
        populateMultiResponseBuilderCheckboxes();
        populateCrosstabBuilders();
        renderDataDictionaryTable();
        
        closeRenameLabelModal();
        showModal('Success', 'Labels updated successfully.');
        
    } catch (e) {
        showRenameLabelError(e.message);
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Save Changes';
        }
    }
}
window.executeVariableLabelRename = executeVariableLabelRename;

// ==========================================
// SPSS SYNTAX EXECUTION MODAL & ACTIONS
// ==========================================
function openExecuteSyntaxModal() {
    clearExecuteSyntaxError();
    const codeInput = document.getElementById('syntax-code-input');
    const previewEl = document.getElementById('syntax-pandas-preview');
    const fileInput = document.getElementById('execute-syntax-file-input');
    
    if (codeInput) codeInput.value = '';
    if (previewEl) previewEl.textContent = '# Type SPSS syntax in the left panel to see real-time translation.';
    if (fileInput) fileInput.value = '';
    
    hideAutocomplete();
    updateEditorBackdrop();
    
    const modal = document.getElementById('modal-execute-syntax');
    if (modal) {
        modal.classList.add('active');
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}
window.openExecuteSyntaxModal = openExecuteSyntaxModal;

function closeExecuteSyntaxModal() {
    const modal = document.getElementById('modal-execute-syntax');
    if (modal) modal.classList.remove('active');
}
window.closeExecuteSyntaxModal = closeExecuteSyntaxModal;

function showExecuteSyntaxError(msg) {
    const errContainer = document.getElementById('execute-syntax-step-error');
    const errMsg = document.getElementById('execute-syntax-step-error-msg');
    if (errContainer && errMsg) {
        errMsg.textContent = msg;
        errContainer.style.display = 'flex';
    }
}
window.showExecuteSyntaxError = showExecuteSyntaxError;

function clearExecuteSyntaxError() {
    const errContainer = document.getElementById('execute-syntax-step-error');
    if (errContainer) {
        errContainer.style.display = 'none';
    }
}
window.clearExecuteSyntaxError = clearExecuteSyntaxError;

function handleExecuteSyntaxFile(file) {
    const isSps = file.name.endsWith('.sps');
    const isTxt = file.name.endsWith('.txt');
    if (!isSps && !isTxt) {
        showExecuteSyntaxError('Please upload an SPSS syntax file (.sps) or plain text file (.txt).');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const codeInput = document.getElementById('syntax-code-input');
        if (codeInput) {
            codeInput.value = text;
            // Trigger input event to update preview
            codeInput.dispatchEvent(new Event('input'));
        }
        clearExecuteSyntaxError();
    };
    reader.readAsText(file);
}
window.handleExecuteSyntaxFile = handleExecuteSyntaxFile;

async function runSpssSyntaxExecution() {
    clearExecuteSyntaxError();
    
    const codeInput = document.getElementById('syntax-code-input');
    const syntax = codeInput ? codeInput.value.trim() : '';
    
    if (!syntax) {
        showExecuteSyntaxError('Please write or upload SPSS Syntax code before executing.');
        return;
    }
    
    const btnRun = document.getElementById('btn-execute-syntax-run');
    let origBtnHtml = '';
    if (btnRun) {
        origBtnHtml = btnRun.innerHTML;
        btnRun.disabled = true;
        btnRun.textContent = 'Executing Syntax...';
    }
    
    try {
        const response = await fetch('/api/variables/execute-syntax', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ syntax })
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || 'Failed to execute syntax.');
        }
        
        const data = await response.json();
        
        state.variables = data.dictionary;
        
        state.dataViewLoaded = false;
        state.dataViewFilename = null;
        state.dataViewColumns = [];
        state.dataViewRows = [];
        
        renderVariableLists();
        populateMultiResponseBuilderCheckboxes();
        populateCrosstabBuilders();
        renderDataDictionaryTable();
        
        closeExecuteSyntaxModal();
        showModal('Success', data.message || 'Syntax executed successfully.');
        
    } catch (e) {
        showExecuteSyntaxError(e.message);
    } finally {
        if (btnRun) {
            btnRun.disabled = false;
            btnRun.innerHTML = origBtnHtml;
        }
    }
}
window.runSpssSyntaxExecution = runSpssSyntaxExecution;

function splitSpssSyntaxJS(syntaxText) {
    const lines = syntaxText.split(/\r?\n/);
    const cleanLines = [];
    let inComment = false;
    
    for (let line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        
        if (inComment) {
            if (line.includes('.')) {
                const parts = line.split(/\.(.+)/);
                inComment = false;
                if (parts[1] && parts[1].trim()) {
                    cleanLines.push(parts[1]);
                }
            }
            continue;
        }
        
        if (trimmed.startsWith('*') || trimmed.toUpperCase().startsWith('COMMENT')) {
            if (line.includes('.')) {
                const parts = line.split(/\.(.+)/);
                if (parts[1] && parts[1].trim()) {
                    cleanLines.push(parts[1]);
                }
            } else {
                inComment = true;
            }
            continue;
        }
        
        cleanLines.push(line);
    }
    
    const fullText = cleanLines.join('\n');
    const statements = [];
    let current = [];
    let inQuote = false;
    let quoteChar = null;
    
    for (let i = 0; i < fullText.length; i++) {
        const char = fullText[i];
        if (char === "'" || char === '"') {
            if (!inQuote) {
                inQuote = true;
                quoteChar = char;
            } else if (char === quoteChar) {
                inQuote = false;
                quoteChar = null;
            }
        }
        
        if (char === '.' && !inQuote) {
            statements.push(current.join('').trim());
            current = [];
        } else {
            current.push(char);
        }
    }
    
    const rem = current.join('').trim();
    if (rem) {
        statements.push(rem);
    }
    
    return statements.map(s => s.trim()).filter(s => s.length > 0);
}
window.splitSpssSyntaxJS = splitSpssSyntaxJS;

function translateSpssToPandas(syntaxText) {
    if (!syntaxText || !syntaxText.trim()) {
        return "# Type SPSS syntax in the left panel to see real-time translation.";
    }
    
    try {
        const statements = splitSpssSyntaxJS(syntaxText);
        const pythonLines = ["# --- Python / Pandas Equivalent Code ---"];
        const variableRenameMap = {};
        
        for (let stmt of statements) {
            const stmtClean = stmt.replace(/\s+/g, ' ').trim();
            if (!stmtClean) continue;
            
            const firstSpace = stmtClean.indexOf(' ');
            let verb = '';
            let rest = '';
            if (firstSpace === -1) {
                verb = stmtClean.toUpperCase();
            } else {
                verb = stmtClean.substring(0, firstSpace).toUpperCase();
                rest = stmtClean.substring(firstSpace + 1).trim();
            }
            
            let verbPhrase = verb;
            if (rest) {
                const secondSpace = rest.indexOf(' ');
                const secondWord = (secondSpace === -1) ? rest.toUpperCase() : rest.substring(0, secondSpace).toUpperCase();
                verbPhrase = verb + ' ' + secondWord;
            }
            
            // 1. DELETE VARIABLES
            if (verbPhrase.startsWith("DELETE VARIABLES") || verb.startsWith("DELETE")) {
                let content = stmtClean;
                if (verbPhrase.startsWith("DELETE VARIABLES")) {
                    content = stmtClean.substring("DELETE VARIABLES".length).trim();
                } else {
                    content = stmtClean.substring("DELETE".length).trim();
                    if (content.toUpperCase().startsWith("VARIABLES")) {
                        content = content.substring("VARIABLES".length).trim();
                    }
                }
                const vars = content.split(/\s+/).filter(v => v.trim());
                if (vars.length > 0) {
                    const quotedVars = vars.map(v => `'${v}'`).join(', ');
                    pythonLines.push(`df = df.drop(columns=[${quotedVars}])`);
                } else {
                    pythonLines.push(`# Warning: Empty DELETE VARIABLES statement`);
                }
            }
            // 2. RENAME VARIABLES
            else if (verbPhrase.startsWith("RENAME VARIABLES") || verb.startsWith("RENAME")) {
                let content = stmtClean;
                if (verbPhrase.startsWith("RENAME VARIABLES")) {
                    content = stmtClean.substring("RENAME VARIABLES".length).trim();
                } else {
                    content = stmtClean.substring("RENAME".length).trim();
                    if (content.toUpperCase().startsWith("VARIABLES")) {
                        content = content.substring("VARIABLES".length).trim();
                    }
                }
                
                const cleaned = content.replace(/\(/g, ' ').replace(/\)/g, ' ').replace(/\s*=\s*/g, '=');
                const tokens = cleaned.split(/\s+/).filter(t => t.trim());
                
                const stepRenameMap = {};
                for (let rTok of tokens) {
                    if (rTok.includes('=')) {
                        const parts = rTok.split('=');
                        const src = parts[0].trim();
                        const dst = parts[1].trim();
                        if (src && dst) {
                            stepRenameMap[src] = dst;
                            variableRenameMap[src] = dst;
                        }
                    }
                }
                
                if (Object.keys(stepRenameMap).length > 0) {
                    const renameDictStr = Object.entries(stepRenameMap)
                        .map(([k, v]) => `'${k}': '${v}'`)
                        .join(', ');
                    pythonLines.push(`df = df.rename(columns={${renameDictStr}})`);
                } else {
                    pythonLines.push(`# Warning: Empty RENAME VARIABLES statement`);
                }
            }
            // 3. VARIABLE LABELS
            else if (verbPhrase.startsWith("VARIABLE LABELS") || verb.startsWith("VARIABLE")) {
                let content = stmtClean;
                if (verbPhrase.startsWith("VARIABLE LABELS")) {
                    content = stmtClean.substring("VARIABLE LABELS".length).trim();
                } else {
                    content = stmtClean.substring("VARIABLE".length).trim();
                    if (content.toUpperCase().startsWith("LABELS")) {
                        content = content.substring("LABELS".length).trim();
                    }
                }
                
                const pattern = /([a-zA-Z0-9_]+)\s+(['"])(.*?)\2/g;
                let match;
                let matchedAny = false;
                
                while ((match = pattern.exec(content)) !== null) {
                    const origVar = match[1];
                    const val = match[3];
                    const resolvedVar = variableRenameMap[origVar] || origVar;
                    pythonLines.push(`column_labels['${resolvedVar}'] = '${val.replace(/'/g, "\\'")}'`);
                    matchedAny = true;
                }
                
                if (!matchedAny) {
                    pythonLines.push(`# Warning: Could not parse VARIABLE LABELS syntax`);
                }
            }
            // 4. VALUE LABELS
            else if (verbPhrase.startsWith("VALUE LABELS") || verb.startsWith("VALUE")) {
                let content = stmtClean;
                if (verbPhrase.startsWith("VALUE LABELS")) {
                    content = stmtClean.substring("VALUE LABELS".length).trim();
                } else {
                    content = stmtClean.substring("VALUE".length).trim();
                    if (content.toUpperCase().startsWith("LABELS")) {
                        content = content.substring("LABELS".length).trim();
                    }
                }
                
                const parts = content.split('/');
                let matchedAny = false;
                for (let part of parts) {
                    part = part.trim();
                    if (!part) continue;
                    
                    const subtokens = part.split(/\s+/);
                    if (subtokens.length < 2) continue;
                    
                    const rawVar = subtokens[0];
                    const mappingStr = part.substring(rawVar.length).trim();
                    const resolvedVar = variableRenameMap[rawVar] || rawVar;
                    
                    const pairPattern = /(\d+(?:\.\d+)?|['"].*?['"])\s+(['"])(.*?)\2/g;
                    let pMatch;
                    const valMap = [];
                    
                    while ((pMatch = pairPattern.exec(mappingStr)) !== null) {
                        const valRaw = pMatch[1].replace(/['"]/g, '');
                        const label = pMatch[3];
                        
                        let valVal = valRaw;
                        if (!isNaN(valRaw) && valRaw.trim() !== '') {
                            if (valRaw.includes('.')) {
                                valVal = parseFloat(valRaw);
                            } else {
                                valVal = parseInt(valRaw, 10);
                            }
                        } else {
                            valVal = `'${valRaw}'`;
                        }
                        
                        valMap.push(`${typeof valVal === 'string' ? valVal : valVal}: '${label.replace(/'/g, "\\'")}'`);
                    }
                    
                    if (valMap.length > 0) {
                        pythonLines.push(`value_labels['${resolvedVar}'] = {${valMap.join(', ')}}`);
                        matchedAny = true;
                    }
                }
                
                if (!matchedAny) {
                    pythonLines.push(`# Warning: Could not parse VALUE LABELS syntax`);
                }
            }
            // 5. COMPUTE
            else if (verb.startsWith("COMPUTE")) {
                const content = stmtClean.substring("COMPUTE".length).trim();
                const eqIndex = content.indexOf('=');
                if (eqIndex !== -1) {
                    const targetVar = content.substring(0, eqIndex).trim();
                    const rawExpr = content.substring(eqIndex + 1).trim();
                    
                    let expr = rawExpr;
                    const sortedRenames = Object.keys(variableRenameMap).sort((a, b) => b.length - a.length);
                    for (let oldName of sortedRenames) {
                        const newName = variableRenameMap[oldName];
                        const regex = new RegExp(`\\b${oldName}\\b`, 'g');
                        expr = expr.replace(regex, newName);
                    }
                    
                    let exprEval = expr;
                    exprEval = exprEval.replace(/\bAND\b/gi, '&');
                    exprEval = exprEval.replace(/\bOR\b/gi, '|');
                    exprEval = exprEval.replace(/\bNOT\b/gi, '~');
                    exprEval = exprEval.replace(/<>/g, '!=');
                    exprEval = exprEval.replace(/(?<![<>=!])=(?!=)/g, '==');
                    
                    const isBool = /==|!=|>|<|>=|<=|&|\||~/.test(exprEval);
                    if (isBool) {
                        pythonLines.push(`df['${targetVar}'] = df.eval("${exprEval}").astype(int)`);
                    } else {
                        if (!isNaN(exprEval.trim()) && exprEval.trim() !== '') {
                            pythonLines.push(`df['${targetVar}'] = ${exprEval.trim()}`);
                        } else {
                            pythonLines.push(`df['${targetVar}'] = df.eval("${exprEval}")`);
                        }
                    }
                } else {
                    pythonLines.push(`# Warning: Invalid COMPUTE statement format`);
                }
            }
            // 6. MISSING VALUES
            else if (verbPhrase.startsWith("MISSING VALUES") || verb.startsWith("MISSING")) {
                let content = stmtClean;
                if (verbPhrase.startsWith("MISSING VALUES")) {
                    content = stmtClean.substring("MISSING VALUES".length).trim();
                } else {
                    content = stmtClean.substring("MISSING".length).trim();
                    if (content.toUpperCase().startsWith("VALUES")) {
                        content = content.substring("VALUES".length).trim();
                    }
                }
                
                const parts = content.split('/');
                let matchedAny = false;
                for (let part of parts) {
                    part = part.trim();
                    const match = part.match(/([a-zA-Z0-9_]+)\s*\((.*?)\)/);
                    if (match) {
                        const rawVar = match[1].trim();
                        const valsStr = match[2].trim();
                        const resolvedVar = variableRenameMap[rawVar] || rawVar;
                        
                        const vals = valsStr.split(',').map(v => v.trim().replace(/['"]/g, '')).filter(v => v.length > 0);
                        const parsedVals = vals.map(v => {
                            if (!isNaN(v) && v.trim() !== '') {
                                return v;
                            }
                            return `'${v}'`;
                        });
                        
                        pythonLines.push(`missing_values['${resolvedVar}'] = [${parsedVals.join(', ')}]`);
                        matchedAny = true;
                    }
                }
                if (!matchedAny) {
                    pythonLines.push(`# Warning: Could not parse MISSING VALUES syntax`);
                }
            }
            // 7. EXECUTE
            else if (verb === "EXECUTE") {
                pythonLines.push(`# Changes written successfully to disk`);
            }
            else {
                pythonLines.push(`# Warning: Command '${verb}' is not supported and will be skipped.`);
            }
        }
        
        return pythonLines.join('\n');
    } catch (e) {
        return `# Error during translation: ${e.message}`;
    }
}
window.translateSpssToPandas = translateSpssToPandas;

// ==========================================
// SPSS EDITOR SYNTAX HIGHLIGHTING & AUTOCOMPLETE
// ==========================================
let autocompleteActiveIndex = -1;
let autocompleteSuggestions = [];

function hideAutocomplete() {
    const list = document.getElementById('spss-autocomplete-list');
    if (list) list.style.display = 'none';
    autocompleteActiveIndex = -1;
    autocompleteSuggestions = [];
}
window.hideAutocomplete = hideAutocomplete;

function handleAutocompleteTrigger(textarea) {
    const text = textarea.value;
    const cursor = textarea.selectionStart;
    const beforeText = text.substring(0, cursor);
    const wordMatch = beforeText.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
    
    if (!wordMatch) {
        hideAutocomplete();
        return;
    }
    
    const currentWord = wordMatch[0];
    const currentWordUpper = currentWord.toUpperCase();
    
    // Available variables list
    const vars = (state.variables || []).map(v => v.variable_name);
    // SPSS keywords
    const keywords = [
        "DELETE VARIABLES", "DELETE", "VARIABLES",
        "RENAME VARIABLES", "RENAME",
        "VARIABLE LABELS", "VARIABLE", "LABELS",
        "VALUE LABELS", "VALUE",
        "COMPUTE", "EXECUTE",
        "MISSING VALUES", "MISSING", "VALUES"
    ];
    
    // Filter suggestions
    const matchedVars = vars.filter(v => v.toUpperCase().startsWith(currentWordUpper) && v.toUpperCase() !== currentWordUpper);
    const matchedKeywords = keywords.filter(k => k.toUpperCase().startsWith(currentWordUpper) && k.toUpperCase() !== currentWordUpper);
    
    // Combine suggestions: first keywords, then variables
    const suggestions = [];
    matchedKeywords.forEach(k => suggestions.push({ name: k, type: "Keyword" }));
    matchedVars.forEach(v => suggestions.push({ name: v, type: "Variable" }));
    
    if (suggestions.length === 0) {
        hideAutocomplete();
        return;
    }
    
    autocompleteSuggestions = suggestions.slice(0, 10); // cap at 10 items
    
    // Keep index within boundaries
    if (autocompleteActiveIndex < 0 || autocompleteActiveIndex >= autocompleteSuggestions.length) {
        autocompleteActiveIndex = 0;
    }
    
    renderAutocompleteDropdown(textarea, currentWord);
}
window.handleAutocompleteTrigger = handleAutocompleteTrigger;

function renderAutocompleteDropdown(textarea, currentWord) {
    const list = document.getElementById('spss-autocomplete-list');
    if (!list) return;
    
    list.innerHTML = autocompleteSuggestions.map((s, idx) => `
        <div class="spss-autocomplete-item ${idx === autocompleteActiveIndex ? 'active' : ''}" data-index="${idx}">
            <span>${s.name}</span>
            <span class="spss-autocomplete-meta">${s.type}</span>
        </div>
    `).join('');
    
    // Calculate caret coordinates inside monospace textarea
    const text = textarea.value;
    const cursor = textarea.selectionStart;
    const beforeText = text.substring(0, cursor - currentWord.length);
    const lines = beforeText.split("\n");
    const currentRow = lines.length - 1;
    const currentColumn = lines[lines.length - 1].length;
    
    // Constants matching monospace font styling details
    const rowHeight = 16.8;
    const charWidth = 7.2;
    const padding = 8;
    
    let top = padding + (currentRow + 1) * rowHeight - textarea.scrollTop;
    let left = padding + currentColumn * charWidth - textarea.scrollLeft;
    
    const container = textarea.parentElement;
    
    // Contain dropdown inside editor viewport boundaries
    top = Math.max(8, Math.min(top, container.clientHeight - 160));
    left = Math.max(8, Math.min(left, container.clientWidth - 230));
    
    list.style.top = `${top}px`;
    list.style.left = `${left}px`;
    list.style.display = 'flex';
    
    // Attach click listeners to autocomplete items
    const items = list.querySelectorAll('.spss-autocomplete-item');
    items.forEach(item => {
        item.addEventListener('click', (e) => {
            const idx = parseInt(item.getAttribute('data-index'), 10);
            if (autocompleteSuggestions[idx]) {
                insertSuggestion(textarea, autocompleteSuggestions[idx].name);
            }
        });
    });
}
window.renderAutocompleteDropdown = renderAutocompleteDropdown;

function insertSuggestion(textarea, word) {
    const text = textarea.value;
    const cursor = textarea.selectionStart;
    const beforeText = text.substring(0, cursor);
    const afterText = text.substring(cursor);
    
    const wordMatch = beforeText.match(/[a-zA-Z_][a-zA-Z0-9_]*$/);
    if (wordMatch) {
        const start = cursor - wordMatch[0].length;
        textarea.value = text.substring(0, start) + word + " " + afterText;
        textarea.selectionStart = textarea.selectionEnd = start + word.length + 1; // cursor after word and space
    }
    
    updateEditorBackdrop();
    hideAutocomplete();
    
    // Trigger input event to update Pandas preview
    textarea.dispatchEvent(new Event('input'));
}
window.insertSuggestion = insertSuggestion;

function handleEditorKeydown(e, textarea) {
    const list = document.getElementById('spss-autocomplete-list');
    if (!list || list.style.display === 'none') {
        return;
    }
    
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex + 1) % autocompleteSuggestions.length;
        const currentWord = ""; // not needed for rendering position since it is already displayed
        renderAutocompleteDropdown(textarea, currentWord);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        autocompleteActiveIndex = (autocompleteActiveIndex - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length;
        const currentWord = "";
        renderAutocompleteDropdown(textarea, currentWord);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (autocompleteActiveIndex >= 0 && autocompleteActiveIndex < autocompleteSuggestions.length) {
            insertSuggestion(textarea, autocompleteSuggestions[autocompleteActiveIndex].name);
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        hideAutocomplete();
    }
}
window.handleEditorKeydown = handleEditorKeydown;

function updateEditorBackdrop() {
    const textarea = document.getElementById('syntax-code-input');
    const backdrop = document.getElementById('syntax-code-backdrop');
    if (textarea && backdrop) {
        backdrop.innerHTML = highlightSpssSyntax(textarea.value);
        backdrop.scrollTop = textarea.scrollTop;
        backdrop.scrollLeft = textarea.scrollLeft;
    }
}
window.updateEditorBackdrop = updateEditorBackdrop;

function highlightSpssSyntax(text) {
    if (!text) return "";
    
    // Escape HTML characters
    let escaped = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    // Standard SPSS keywords to highlight
    const keywords = [
        "DELETE VARIABLES", "DELETE", "VARIABLES",
        "RENAME VARIABLES", "RENAME",
        "VARIABLE LABELS", "VARIABLE", "LABELS",
        "VALUE LABELS", "VALUE",
        "COMPUTE", "EXECUTE",
        "MISSING VALUES", "MISSING", "VALUES"
    ];
    
    // Active variables for lookup (case-insensitive)
    const activeVars = new Set((state.variables || []).map(v => v.variable_name.toUpperCase()));
    
    const lines = escaped.split("\n");
    const highlightedLines = lines.map(line => {
        let trimmed = line.trim();
        if (trimmed.startsWith("*") || trimmed.toUpperCase().startsWith("COMMENT")) {
            return `<span class="spss-comment">${line}</span>`;
        }
        
        const tokenRegex = /(".*?"|'.*?'|[0-9]+(?:\.[0-9]+)?|[a-zA-Z_][a-zA-Z0-9_]*|[+\-*\/=<>!&|~(),.\/]+|\s+)/g;
        const tokens = line.match(tokenRegex) || [line];
        let lineResult = "";
        
        for (let tok of tokens) {
            let tokUpper = tok.toUpperCase().trim();
            if (!tok.trim()) {
                lineResult += tok;
            } else if (tok.startsWith('"') || tok.startsWith("'")) {
                lineResult += `<span class="spss-string">${tok}</span>`;
            } else if (!isNaN(tok) && !isNaN(parseFloat(tok))) {
                lineResult += `<span class="spss-number">${tok}</span>`;
            } else if (keywords.includes(tokUpper)) {
                lineResult += `<span class="spss-keyword">${tok}</span>`;
            } else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tok)) {
                if (activeVars.has(tokUpper)) {
                    lineResult += `<span class="spss-variable-valid">${tok}</span>`;
                } else {
                    lineResult += `<span class="spss-variable-invalid" title="Variable '${tok}' does not exist">${tok}</span>`;
                }
            } else {
                lineResult += tok;
            }
        }
        
        return lineResult;
    });
    
    return highlightedLines.join("\n") + (text.endsWith("\n") ? "\n" : "");
}
window.highlightSpssSyntax = highlightSpssSyntax;
