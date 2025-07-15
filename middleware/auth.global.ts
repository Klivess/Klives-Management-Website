
import { VerifyLogin, RequestGETFromKliveAPI } from '~/scripts/APIInterface';

//Make this async to use await inside
export default defineNuxtRouteMiddleware((to, from) => {
  //if not at login page, verify login - only run on client side
  if (to.path !== '/') {
    // Use process.client to ensure this only runs on client-side
    if (process.client) {
      VerifyLogin();
    }
  }
})