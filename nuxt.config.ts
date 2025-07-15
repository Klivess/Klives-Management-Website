// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  routeRules: {
    '/': {prerender: true},
    '/administration/**': {ssr: false}, // Disable SSR for admin routes
    '/*': {cors: true},
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@use "~/assets/scss/_colors.scss" as *;'
        }
      }
    }
  },
  app: {
    head: {
      title: 'Klives Management',
      meta: [
        { name: 'A website for Klives to manage all his amazing inventions', content: "Klives's amazing website." }
      ],
      link: [{
        rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Roboto:wght@500&display=swap'
      }],
    },
    layoutTransition: { name: 'layout', mode: 'out-in' },
    pageTransition: { name: 'page', mode: 'out-in' },
  },
  css: ['~/assets/scss/main.scss',
    '~/assets/scss/main.scss',
    '~/assets/scss/button.scss',
    '~/assets/scss/inputbox.scss',
    '~/assets/scss/navbar.scss',
    '~/assets/scss/klivetech.scss'],
  modules: []
})
