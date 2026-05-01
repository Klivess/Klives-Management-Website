<template>
<div class="admin-profile-page">
    <section class="profile-hero">
        <div class="hero-copy">
            <p class="hero-eyebrow">Klives Management</p>
            <h1 class="hero-title">Edit Profile</h1>
            <p class="hero-subtitle">Adjust identity, access, and rank from one screen without jumping between admin panels.</p>
        </div>
        <div class="hero-stats">
            <div class="hero-stat">
                <span class="hero-stat-label">Profile ID</span>
                <span class="hero-stat-value">{{ userID || 'Loading...' }}</span>
            </div>
            <div class="hero-stat">
                <span class="hero-stat-label">Rank</span>
                <span class="hero-stat-value clr-accent">{{ userRank }}</span>
            </div>
            <div class="hero-stat">
                <span class="hero-stat-label">Access</span>
                <span class="hero-stat-value" :class="canLogin ? 'clr-success' : 'clr-danger'">{{ canLogin ? 'Enabled' : 'Disabled' }}</span>
            </div>
        </div>
    </section>

    <p v-if="statusMessage" class="status-banner" :class="statusToneClass">{{ statusMessage }}</p>

    <KMInfoGrid columns="2" rows="1" rowHeight="auto">
        <KMInfoBox caption="Profile Editor">
            <div class="editor-panel">
                <div class="field-block">
                    <label class="field-label">Display Name</label>
                    <p class="field-hint">This is the name shown in admin views and audit messages.</p>
                    <KMInputBox v-model:value="userName" class="profile-input" placeholder="Enter a profile name" />
                </div>

                <div class="field-block">
                    <label class="field-label">Password</label>
                    <p class="field-hint">Rotate the password here if this profile needs a new login secret.</p>
                    <KMInputBox v-model:value="userPassword" class="profile-input" placeholder="Set a password" />
                </div>

                <div class="field-block">
                    <label class="field-label">Rank</label>
                    <p class="field-hint">Ranks control what the profile can see and operate inside Klives Management.</p>
                    <KMSelectBox v-model:selected="userRank" :options="rankOptions" class="profile-select" />
                </div>

                <div class="login-card" :class="canLogin ? 'login-enabled' : 'login-disabled'">
                    <div class="login-card-copy">
                        <p class="login-card-title">Access Control</p>
                        <p class="login-card-text">{{ canLogin ? 'This profile can currently sign in and use the panel.' : 'This profile is locked out until access is re-enabled.' }}</p>
                    </div>
                    <KMCheckBox v-model:boxChecked="canLogin" message="Allow this profile to log in" />
                </div>
            </div>
        </KMInfoBox>

        <KMInfoBox caption="Profile Snapshot">
            <div class="summary-panel">
                <div class="summary-card highlight-card">
                    <span class="summary-label">Created</span>
                    <span class="summary-value">{{ creationDateText }}</span>
                    <p class="summary-caption">Original profile creation timestamp.</p>
                </div>

                <div class="summary-card">
                    <span class="summary-label">Current Rank</span>
                    <span class="summary-value">{{ userRank }}</span>
                    <p class="summary-caption">{{ currentRankDescription }}</p>
                </div>

                <div class="summary-card">
                    <span class="summary-label">Login Status</span>
                    <span class="summary-value" :class="canLogin ? 'clr-success' : 'clr-danger'">{{ canLogin ? 'Authentication allowed' : 'Authentication blocked' }}</span>
                    <p class="summary-caption">Disable login to freeze the profile without deleting it.</p>
                </div>

                <div class="summary-card security-card">
                    <span class="summary-label">Security Note</span>
                    <span class="summary-value">Password changes apply immediately.</span>
                    <p class="summary-caption">If you are promoting a user and adjusting access in the same save, access is now updated before rank changes so the request does not get rejected midway.</p>
                </div>
            </div>
        </KMInfoBox>
    </KMInfoGrid>

    <section class="action-row">
        <button class="profile-action primary" :disabled="isSaving || isLoading || !userID" @click="ModifyProfile">
            {{ primaryActionLabel }}
        </button>
        <button class="profile-action secondary" :disabled="isSaving || isLoading" @click="GetProfileInfo">
            Reset Changes
        </button>
        <button class="profile-action danger" :disabled="isSaving || isDeleting || isLoading" @click="DeleteProfile">
            {{ deleteActionLabel }}
        </button>
    </section>
</div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
</script>

<script>
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import Swal from 'sweetalert2';

export default {
    name: "AdminProfilePage",
    data() {
        return {
            userID: "",
            rankOptions: [
                "Guest",
                "Manager",
                "Associate",
                "Admin",
                "Klives"
            ],
            userName: "",
            userPassword: "",
            userRank: "Guest",
            canLogin: false,
            creationDateText: "Loading...",
            isLoading: false,
            isSaving: false,
            isDeleting: false,
            statusMessage: "",
            statusTone: "neutral"
        };
    },
    computed: {
        primaryActionLabel() {
            if (this.isLoading) return 'Loading Profile...';
            if (this.isSaving) return 'Saving Changes...';
            return 'Save Profile Changes';
        },
        deleteActionLabel() {
            return this.isDeleting ? 'Deleting Profile...' : 'Delete Profile';
        },
        currentRankDescription() {
            const descriptions = {
                Guest: 'Read-only entry point with minimal access.',
                Manager: 'Operational control over standard management tools.',
                Associate: 'Broader management access for internal workflows.',
                Admin: 'High-level control over profiles and system operations.',
                Klives: 'Full top-level ownership and unrestricted access.'
            };

            return descriptions[this.userRank] || 'Rank description unavailable.';
        },
        statusToneClass() {
            return `status-${this.statusTone}`;
        }
    },
    methods: {
        setStatus(message, tone = 'neutral') {
            this.statusMessage = message;
            this.statusTone = tone;
        },
        async readResponseText(response) {
            try {
                return await response.text();
            } catch {
                return '';
            }
        },
        async GetProfileInfo() {
            if (!this.userID) return;

            this.isLoading = true;
            this.setStatus('Refreshing profile data...', 'neutral');

            try {
                const response = await RequestGETFromKliveAPI('/KMProfiles/GetProfileByID?id=' + encodeURIComponent(this.userID));
                if (!response.ok) {
                    throw new Error('Failed to get profile info.');
                }

                const data = await response.json();
                this.userName = data.Name || '';
                this.userPassword = data.Password || '';
                const date = new Date(data.CreationDate);
                this.creationDateText = Number.isNaN(date.getTime())
                    ? 'Unknown'
                    : date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                this.userRank = this.rankOptions[Math.max((data.KlivesManagementRank || 1) - 1, 0)] || 'Guest';
                this.canLogin = Boolean(data.CanLogin);
                this.setStatus('Profile data loaded.', 'success');
            } catch (error) {
                this.setStatus('Failed to load profile data.', 'danger');
                await Swal.fire({
                    icon: 'error',
                    title: 'Profile Load Failed',
                    text: error?.message || 'Failed to get profile info.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
                window.location.replace('/');
            } finally {
                this.isLoading = false;
            }
        },
        async DeleteProfile() {
            if (this.isDeleting || !this.userID) return;

            const result = await Swal.fire({
                icon: 'warning',
                title: 'Delete Profile?',
                text: 'This will permanently remove the profile from Klives Management.',
                showCancelButton: true,
                confirmButtonText: 'Delete Profile',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#5f5f5f',
                background: '#161516',
                color: '#ffffff',
                customClass: {
                    popup: 'swal-dark-theme'
                }
            });

            if (!result.isConfirmed) return;

            this.isDeleting = true;
            try {
                const response = await RequestPOSTFromKliveAPI('/KMProfiles/DeleteProfile?id=' + encodeURIComponent(this.userID));
                if (!response.ok) {
                    throw new Error(await this.readResponseText(response) || 'Profile deletion failed.');
                }

                await Swal.fire({
                    icon: 'success',
                    title: 'Profile Deleted',
                    text: 'Profile has been successfully deleted.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
                window.location.replace('/admin');
            } catch (error) {
                this.setStatus('Profile deletion failed.', 'danger');
                await Swal.fire({
                    icon: 'error',
                    title: 'Delete Failed',
                    text: error?.message || 'Profile deletion failed.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
            } finally {
                this.isDeleting = false;
            }
        },
        async ChangeCanLogin() {
            return await RequestPOSTFromKliveAPI(
                '/KMProfiles/ChangeCanLogin?id=' + encodeURIComponent(this.userID) + '&enabled=' + this.canLogin.toString(),
                '',
                false
            );
        },
        async ChangeName() {
            return await RequestPOSTFromKliveAPI(
                '/KMProfiles/ChangeProfileName?id=' + encodeURIComponent(this.userID) + '&name=' + encodeURIComponent(this.userName),
                '',
                false
            );
        },
        async ChangePassword() {
            return await RequestPOSTFromKliveAPI(
                '/KMProfiles/ChangeProfilePassword?id=' + encodeURIComponent(this.userID),
                this.userPassword,
                false
            );
        },
        async ChangeRank() {
            const rank = this.rankOptions.indexOf(this.userRank) + 1;
            return await RequestPOSTFromKliveAPI(
                '/KMProfiles/ChangeProfileRank?id=' + encodeURIComponent(this.userID) + '&rank=' + rank,
                '',
                false
            );
        },
        async ensureSuccessfulResponse(response, failureTitle) {
            if (response.ok) {
                return;
            }

            const reason = await this.readResponseText(response);
            throw new Error(reason || failureTitle);
        },
        async ModifyProfile() {
            if (this.isSaving || !this.userID) return;

            this.isSaving = true;
            this.setStatus('Saving profile changes...', 'neutral');

            try {
                await this.ensureSuccessfulResponse(await this.ChangeName(), 'Unable to change profile name.');
                await this.ensureSuccessfulResponse(await this.ChangePassword(), 'Unable to change profile password.');
                await this.ensureSuccessfulResponse(await this.ChangeCanLogin(), 'Unable to change login access.');
                await this.ensureSuccessfulResponse(await this.ChangeRank(), 'Unable to change profile rank.');

                this.setStatus('Profile updated successfully.', 'success');
                await Swal.fire({
                    icon: 'success',
                    title: 'Profile Updated',
                    text: 'All requested profile changes have been saved.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });

                await this.GetProfileInfo();
            } catch (error) {
                this.setStatus('Profile update failed.', 'danger');
                await Swal.fire({
                    icon: 'error',
                    title: 'Update Failed',
                    text: error?.message || 'One or more profile changes failed to save.',
                    confirmButtonColor: '#4d9e39',
                    background: '#161516',
                    color: '#ffffff',
                    customClass: {
                        popup: 'swal-dark-theme'
                    }
                });
            } finally {
                this.isSaving = false;
            }
        }
    },
    mounted() {
        this.userID = this.$route.query.userID;
        if (!this.userID) {
            this.setStatus('No profile ID was provided.', 'danger');
            return;
        }
        this.GetProfileInfo();
    },
};
</script>

<style scoped>
.admin-profile-page {
    min-height: 100vh;
    padding: 28px 24px 40px;
    background:
        radial-gradient(circle at top left, rgba(98, 206, 71, 0.12), transparent 35%),
        radial-gradient(circle at top right, rgba(77, 158, 57, 0.16), transparent 32%),
        linear-gradient(180deg, #181719 0%, #201f20 48%, #171617 100%);
    color: #ffffff;
}

.profile-hero {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: flex-start;
    margin-bottom: 22px;
    padding: 28px;
    border-radius: 26px;
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.03), rgba(77, 158, 57, 0.08));
    border: 1px solid rgba(77, 158, 57, 0.18);
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
}

.hero-copy {
    max-width: 640px;
}

.hero-eyebrow {
    margin: 0 0 10px;
    color: #8bd47a;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
}

.hero-title {
    margin: 0;
    font-size: clamp(2.4rem, 5vw, 3.6rem);
    line-height: 0.96;
}

.hero-subtitle {
    margin: 14px 0 0;
    max-width: 560px;
    color: #bcbcbc;
    font-size: 1rem;
    line-height: 1.6;
}

.hero-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    min-width: min(460px, 100%);
    flex: 1;
}

.hero-stat {
    padding: 16px 18px;
    border-radius: 18px;
    background: rgba(0, 0, 0, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.06);
}

.hero-stat-label {
    display: block;
    margin-bottom: 10px;
    color: #9f9f9f;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.hero-stat-value {
    display: block;
    font-size: 1.1rem;
    font-weight: 700;
    word-break: break-word;
}

.status-banner {
    margin: 0 0 22px;
    padding: 12px 16px;
    border-radius: 14px;
    font-size: 0.92rem;
    font-weight: 600;
    border: 1px solid transparent;
}

.status-neutral {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.08);
    color: #d8d8d8;
}

.status-success {
    background: rgba(77, 158, 57, 0.12);
    border-color: rgba(98, 206, 71, 0.32);
    color: #d7ffd0;
}

.status-danger {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.26);
    color: #ffd2d2;
}

.editor-panel,
.summary-panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
    height: 100%;
}

.field-block {
    padding: 16px 18px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.025);
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.field-label {
    display: block;
    margin-bottom: 6px;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #e3e3e3;
}

.field-hint {
    margin: 0 0 12px;
    font-size: 0.85rem;
    line-height: 1.5;
    color: #9a9a9a;
}

.profile-input,
.profile-select {
    width: 100%;
}

.login-card {
    display: flex;
    justify-content: space-between;
    gap: 18px;
    align-items: center;
    padding: 18px 20px;
    border-radius: 20px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    transition: border-color 0.2s ease, background 0.2s ease;
}

.login-enabled {
    background: linear-gradient(145deg, rgba(77, 158, 57, 0.16), rgba(255, 255, 255, 0.02));
    border-color: rgba(98, 206, 71, 0.28);
}

.login-disabled {
    background: linear-gradient(145deg, rgba(239, 68, 68, 0.13), rgba(255, 255, 255, 0.02));
    border-color: rgba(239, 68, 68, 0.22);
}

.login-card-copy {
    max-width: 420px;
}

.login-card-title {
    margin: 0 0 6px;
    font-size: 1rem;
    font-weight: 700;
}

.login-card-text {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
    color: #c7c7c7;
}

.summary-card {
    padding: 18px 20px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
}

.highlight-card {
    background: linear-gradient(160deg, rgba(77, 158, 57, 0.18), rgba(255, 255, 255, 0.02));
    border-color: rgba(98, 206, 71, 0.28);
}

.security-card {
    background: linear-gradient(160deg, rgba(255, 196, 71, 0.12), rgba(255, 255, 255, 0.02));
    border-color: rgba(255, 196, 71, 0.22);
}

.summary-label {
    display: block;
    margin-bottom: 10px;
    color: #9b9b9b;
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.summary-value {
    display: block;
    margin-bottom: 8px;
    font-size: 1.12rem;
    font-weight: 700;
    color: #ffffff;
}

.summary-caption {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.55;
    color: #b0b0b0;
}

.action-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 22px;
}

.profile-action {
    min-height: 64px;
    border-radius: 18px;
    border: 1px solid transparent;
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease, border-color 0.2s ease;
}

.profile-action:hover:not(:disabled) {
    transform: translateY(-1px);
}

.profile-action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}

.profile-action.primary {
    background: linear-gradient(135deg, #4d9e39, #62ce47);
    color: #081006;
    box-shadow: 0 16px 36px rgba(77, 158, 57, 0.22);
}

.profile-action.secondary {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba(255, 255, 255, 0.08);
    color: #ffffff;
}

.profile-action.danger {
    background: rgba(239, 68, 68, 0.12);
    border-color: rgba(239, 68, 68, 0.24);
    color: #ffd0d0;
}

@media (max-width: 1080px) {
    .profile-hero {
        flex-direction: column;
    }

    .hero-stats {
        min-width: 100%;
    }

    .login-card {
        flex-direction: column;
        align-items: flex-start;
    }
}

@media (max-width: 820px) {
    .admin-profile-page {
        padding: 18px 14px 30px;
    }

    .hero-stats,
    .action-row {
        grid-template-columns: 1fr;
    }
}
</style>