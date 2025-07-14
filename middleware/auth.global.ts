
import { VerifyLogin, RequestGETFromKliveAPI } from '~/scripts/APIInterface';

//Make this async to use await inside
export default defineNuxtRouteMiddleware((to, from) => {
  VerifyLogin();
})