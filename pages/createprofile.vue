<template>
    <KMInfoGrid columns="1" rows="2" rowHeight="350">
        <KMInfoBox caption="Create Profile">
            <div style="display: grid; justify-content: center;">
            <p>Name</p>
            <KMInputBox v-model:value="userName" placeholder="Name" style="width: 400px; margin-top: 10px; margin-bottom: 10px;"/>
            <p>Password</p>
            <KMInputBox v-model:value="userPassword" type="password" placeholder="Password" style="width: 400px; margin-top: 10px; margin-bottom: 10px;"/>
            <p>Rank</p>
            <KMSelectBox v-model:selected="userRank" :options="rankOptions" style="margin-top: 10px; margin-bottom: 10px;" ref="rankSelectBox"/>
            </div>
        </KMInfoBox>
        <KMInfoBox caption="Execute">
            <div style="display: flex; justify-content: center;">
                <KMButton :onclick="CreateProfile" ref="createButton" :message="buttonMessage" style="width: 500px; height: 200px"/>
            </div>
        </KMInfoBox>
    </KMInfoGrid>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
    name: 'CreateProfile',
    data() {
        return {
            rankOptions: [
                "Guest",
                "Manager",
                "Associate",
                "Admin",
                "Klives"
            ],
            buttonMessage: 'Create Profile',
            userName: "",
            userPassword: "",
            userRank: "Guest"
        };
    },
    methods: {
        async CreateProfile() {
            if (!this.userName.trim() || !this.userPassword) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Missing Details',
                    text: 'Name and password are required.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
                return;
            }

            this.buttonMessage = "Creating Profile....";
            const rankIndex = this.rankOptions.indexOf(this.userRank) + 1;
            const params = new URLSearchParams({
                name: this.userName,
                password: this.userPassword,
                rank: String(rankIndex)
            });

            try {
                const response = await RequestPOSTFromKliveAPI(`/KMProfiles/CreateProfile?${params.toString()}`);
                if (response.status === 200) {
                    this.buttonMessage = "Created!";
                    window.location.replace("/admin");
                    return;
                }

                if (response.status === 403) {
                    await Swal.fire({
                        icon: 'error',
                        title: 'Permission Denied',
                        text: 'The server refused to do this. You probably tried to create a rank higher than yourself.',
                        confirmButtonColor: '#4d9e39',
                        background: '#161516',
                        color: '#ffffff',
                        customClass: {
                            popup: 'swal-dark-theme'
                        }
                    });
                    this.buttonMessage = "Create Profile";
                    return;
                }

                if (response.status === 401) {
                    await Swal.fire({
                        icon: 'error',
                        title: 'Unauthorized',
                        text: 'You need to be signed in with sufficient permissions to create profiles.',
                        confirmButtonColor: '#4d9e39',
                        background: '#161516',
                        color: '#ffffff',
                        customClass: {
                            popup: 'swal-dark-theme'
                        }
                    });
                    this.buttonMessage = "Create Profile";
                    return;
                }

                const errorText = await response.text();
                await Swal.fire({
                    icon: 'error',
                    title: 'Create Profile Failed',
                    text: errorText || `The server rejected the request (HTTP ${response.status}).`,
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
                this.buttonMessage = "Create Profile";
            } catch (error) {
                await Swal.fire({
                    icon: 'error',
                    title: 'Network Error',
                    text: 'The request could not be completed. Check the console for details.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
                console.error('CreateProfile failed:', error);
                this.buttonMessage = "Create Profile";
            }
        }
    },
    mounted() {
    }
};
</script>

<style scoped>
/* Component-specific styles */
.create-profile {
    padding: 20px;
}
</style>