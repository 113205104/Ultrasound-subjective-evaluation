const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbx0pXw3alThi70IDIO30FbH_2Tg1SvuzfVsJMpQYOUk4k1fr2nUmwLlPOElc4eU7WU/exec',
  REVIEWERS: ['Reviewer1', 'Reviewer2'],
  SCORE_VALUES: [1, 2, 3, 4],
  PANELS: [
    { key: '1', label: '第一張' },
    { key: '2', label: '第二張' },
    { key: '3', label: '第三張' }
  ],
  CRITERIA: [
    { key: 'whole', label: 'Whole image quality' },
    { key: 'noise', label: 'Noise suppression' },
    { key: 'contrast', label: 'Contrast' },
    { key: 'edge', label: 'Edge sharpness' }
  ]
};
