export default defineAppConfig({
  pages: ['pages/today/index', 'pages/spaces/index', 'pages/weekly/index', 'pages/library/index', 'pages/review/index', 'pages/workspace/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#f4f1e8',
    navigationBarTitleText: '思屿日记',
    navigationBarTextStyle: 'black',
  },
  tabBar: {
    color: '#71807b',
    selectedColor: '#24796c',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      { pagePath: 'pages/today/index', text: '今日' },
      { pagePath: 'pages/spaces/index', text: '思考' },
      { pagePath: 'pages/weekly/index', text: '周报' },
      { pagePath: 'pages/library/index', text: '知识库' },
      { pagePath: 'pages/review/index', text: '回顾' },
    ],
  },
})
