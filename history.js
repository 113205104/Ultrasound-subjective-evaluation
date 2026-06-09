window.APP_CONFIG = {
  appName: 'Ultrasound Subjective Evaluation',
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
  ratingFields: [
    { key: 'whole_quality', label: 'Whole image quality' },
    { key: 'noise_suppression', label: 'Noise suppression' },
    { key: 'contrast', label: 'Contrast' },
    { key: 'edge_sharpness', label: 'Edge sharpness' }
  ],
  ratingScale: [1, 2, 3, 4]
};
