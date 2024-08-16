export default defineNuxtRouteMiddleware((to, from) => {
    console.log(to.query.toString());

    // isAuthenticated() is an example method verifying if a user is authenticated
    if (isAuthenticated() === false && (to.query.toString() !== "/")) {
        abortNavigation("You are not authenticated to access this site.")
        return navigateTo('/login');
    }
  })

function isAuthenticated(){
    return true;
}