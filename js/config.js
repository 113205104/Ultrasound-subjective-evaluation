window.APP_CONFIG = {
  appName: 'Ultrasound Subjective Evaluation',
  // drive: Apps Script directly scans Google Drive and returns the live manifest.
  // file: fallback to static manifest.json.
  manifestSource: 'drive',
  manifestPath: 'manifest.json',
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbx0pXw3alThi70IDIO30FbH_2Tg1SvuzfVsJMpQYOUk4k1fr2nUmwLlPOElc4eU7WU/exec',
  reviewers: ['Reviewer1', 'Reviewer2'],
  modelDisplayMap: {
    cut: 'Model A',
    cyc: 'Model B',
    fast: 'Model C',
    p2p: 'Model D',
    reg: 'Model E'
  },
  tripanelRows: [
    { key: '1', label: '第一張' },
    { key: '2', label: '第二張' },
    { key: '3', label: '第三張' }
  ],
  ratingFields: [
    { key: 'whole_quality', label: 'Whole image quality' },
    { key: 'noise_suppression', label: 'Noise suppression' },
    { key: 'contrast', label: 'Contrast' },
    { key: 'edge_sharpness', label: 'Edge sharpness' }
  ],
  ratingScale: [1, 2, 3, 4]
};
