import { createApp } from 'vue';
import { createHelpCenter } from '../help_ui/src';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import './styles.css';

createApp(App)
  .use(createPinia())
  .use(
    createHelpCenter({
      apiBase: '/api/help',
      commentsBase: '/api/help/comments',
      auth: {
        isSignedIn: () => Boolean(useAuthStore().user),
        signIn: (returnTo) => useAuthStore().startLogin(returnTo),
      },
    }),
  )
  .use(router)
  .mount('#app');
