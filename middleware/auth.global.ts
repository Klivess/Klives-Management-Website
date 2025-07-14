
import { VerifyLogin, RequestGETFromKliveAPI } from '~/scripts/APIInterface';

//Make this async to use await inside
export default defineNuxtRouteMiddleware((to, from) => {
  //if not at login page, verify login
  if (to.path !== '/') {
    VerifyLogin();
  }
})