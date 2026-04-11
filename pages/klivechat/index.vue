<template>
    <div style="padding: 2rem;">
        <h1 style="color: white; margin-bottom: 20px;">KliveChat Networks</h1>
        
        <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 30px;">
            <KMInputBox 
                v-model:value="newRoomName" 
                placeholder="Name your new voice room..." 
                style="width: 300px; height: 40px;" 
            />
            <KMButton 
                @click="createRoom" 
                style="width: 250px; height: 40px;" 
                message="Create Room"
            />
        </div>

        <h2 style="color: white; margin-bottom: 15px;">Active Rooms</h2>
        <div style="display: grid; gap: 15px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));">
            <div v-for="room in activeRooms" :key="room.roomId" style="background: rgba(255, 255, 255, 0.05); padding: 20px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
                <h3 style="color: white; margin: 0 0 10px 0;">{{ room.name }}</h3>
                <div style="color: #aaa; font-size: 0.9em; margin-bottom: 15px;">
                    Host: {{ room.createdBy }} &bull; Users: {{ room.userCount }}
                </div>
                <div style="display: flex; gap: 10px;">
                    <KMButton 
                        @click="joinRoom(room.roomId)" 
                        style="width: 320px; height: 35px;" 
                        message="Join Server"
                    />
                    <KMButton 
                        v-if="room.createdBy === currentName || isHighRank"
                        @click="deleteRoom(room.roomId)" 
                        style="width: 120px; height: 35px; background: #cc3333;" 
                        message="Delete Room"
                    />
                </div>
            </div>
            <div v-if="activeRooms.length === 0" style="color: #666;">
                No active rooms. Create one above!
            </div>
        </div>
    </div>
</template>

<script setup>
definePageMeta({ layout: 'navbar' });
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '../../scripts/APIInterface';

const router = useRouter();
const newRoomName = ref('');
const activeRooms = ref([]);
const currentName = ref('');
const isHighRank = ref(false);

async function loadRooms() {
    try {
        const response = await RequestGETFromKliveAPI('/klivechat/rooms', false, false);
        if (response && response.ok) {
            const data = await response.json();
            activeRooms.value = data;
        }
    } catch (e) {
        console.error("Failed to fetch rooms:", e);
    }
}

async function createRoom() {
    if (!newRoomName.value.trim()) {
        Swal.fire({
            icon: 'warning',
            title: 'Wait',
            text: 'Please enter a name for your room.',
            background: '#161516', color: '#fff'
        });
        return;
    }
    
    try {
        const res = await RequestPOSTFromKliveAPI(`/klivechat/create?name=${encodeURIComponent(newRoomName.value)}`);
        if (res.ok) {
            const data = await res.json();
            router.push(`/shared/klivechat/${data.roomId}`);
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Failed to create room. Check your permissions (Guest+)',
                background: '#161516', color: '#fff'
            });
        }
    } catch(e) {
        console.error("Failed to create room:", e);
    }
}

function joinRoom(id) {
    router.push(`/shared/klivechat/${id}`);
}

async function deleteRoom(id) {
    const result = await Swal.fire({
        title: 'Delete Room?',
        text: 'Are you sure you want to delete this room? All active connections will be severed.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#cc3333',
        cancelButtonColor: '#555',
        confirmButtonText: 'Yes, delete it',
        background: '#161516', color: '#fff'
    });

    if (result.isConfirmed) {
        try {
            const res = await RequestPOSTFromKliveAPI(`/klivechat/delete?id=${id}`);
            if (res.ok) {
                Swal.fire({ title: 'Deleted!', icon: 'success', background: '#161516', color: '#fff' });
                await loadRooms();
            } else {
                Swal.fire({ title: 'Error', text: 'Failed to delete room.', icon: 'error', background: '#161516', color: '#fff' });
            }
        } catch (e) {
            console.error(e);
        }
    }
}

async function fetchMe() {
    try {
        const response = await RequestGETFromKliveAPI('/klivechat/me', false, false);
        if (response && response.ok) {
            const data = await response.json();
            currentName.value = data.name;
            isHighRank.value = data.rank >= 4; // Admin or above
        }
    } catch (e) {
        console.error('Failed to get my profile data:', e);
    }
}

onMounted(() => {
    if (process.client) {
        fetchMe();
    }
    loadRooms();
    setInterval(loadRooms, 10000); // Refresh every 10s
});
</script>

