
import { useCookie } from '#imports';
import { TRUE } from 'sass';
import Swal from 'sweetalert2';

export { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, VerifyLogin, KMPermissions };

const KliveAPIUrl = "https://klive.dev";

enum DeniedRequestReason {
    NoProfile = 0,
    InvalidPassword = 1,
    TooLowClearance = 2,
    IncorrectHTTPMethod = 3,
    ProfileDisabled = 4
}

enum KMPermissions {
    Anybody = 0,
    Guest = 1,
    Manager = 2,
    Associate = 3,
    Admin = 4,
    Klives = 5
}

async function RequestGETFromKliveAPI(query: string, redirectToDashboardIfUnauthorized = true, alertUserIfUnauthorized = true) {
    const pass = GetLocalPassword();
    const res = await fetch(`${KliveAPIUrl}${query}`, {
        method: 'GET',
        mode: 'cors',
        headers: {
            'Authorization': pass,
        },
    });

    if (res.status === 401) {
        // Unauthorized access, handle accordingly
        console.log("Unauthorized access to API");
        if(alertUserIfUnauthorized==true && process.client){
            Swal.fire({
                icon: 'error',
                title: 'Access Denied',
                text: 'You are not authorized to access this resource.',
                confirmButtonColor: '#4d9e39',
                background: '#161516',
                color: '#ffffff',
                customClass: {
                    popup: 'swal-dark-theme'
                }
            });
        }
        if(redirectToDashboardIfUnauthorized==true && process.client){
            window.location.replace('/dashboard');
        }
    }
    return res;
}

async function RequestPOSTFromKliveAPI(query: string, content = "", redirectToDashboardIfUnauthorized = true) {
    const pass = GetLocalPassword();
    let response;
    response = await fetch(KliveAPIUrl + query, {
        method: "POST",
        mode: 'cors',
        body: content,
        headers: {
            "Authorization": pass,
        }
    });
    if (response.status === 401) {
        // Unauthorized access, handle accordingly
        console.log("Unauthorized access to API");
        console.log(response.headers.get('RequestDeniedCode'));

        if (response.headers.get('RequestDeniedCode') == "2") {
            if (process.client) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Insufficient Clearance',
                    text: 'Your profile doesnt have enough clearance to do this.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
                if (redirectToDashboardIfUnauthorized) {
                    window.location.replace('/dashboard');
                }
            }
        }
    }

    return response;
}

function GetLocalPassword() {
    const cook = useCookie('password').value;
    return cook || "";
}

async function VerifyLogin() {
    //Only run this if the user is not already on the login page and we're in the browser
    if (!process.client || window.location.pathname == "/") {
        return;
    }
    RequestGETFromKliveAPI("/KMProfiles/LoginStatus").then(response => {
        response.json().then((json: any) => {
            if (json == "ProfileDisabled") {
                window.location.replace('/');
                Swal.fire({
                    icon: 'error',
                    title: 'Profile Disabled',
                    text: 'Your profile has been disabled.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
            }
            else if (json == "ProfileNotFound") {
                if (window.location.pathname != "/") {
                    window.location.replace('/');
                    Swal.fire({
                        icon: 'error',
                        title: 'Profile Not Found',
                        text: 'You don\'t even have a profile or a password here, get out!!',
                        confirmButtonColor: '#4d9e39',
                        background: '#161516',
                        color: '#ffffff',
                        customClass: {
                            popup: 'swal-dark-theme'
                        }
                    });
                }
            }
        });
    });
}