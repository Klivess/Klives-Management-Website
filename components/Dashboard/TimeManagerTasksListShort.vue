<template>
    <div class="km-profile-list">
        <KMGridList ref="profileList"
            :items="timeTasks"
            buttonColor="#23252B"
            buttonBorderColor="#212127"
            textColor = "#39489E"></KMGridList>
    </div>
</template>

<script>
import { KliveAPIUrl, RequestGETFromKliveAPI, RequestPOSTFromKliveAPI, KMPermissions } from '~/scripts/APIInterface';

export default {
    name: 'TimeManagerTasksListShort',
    data() {
        return {
            // Define your component data properties here
            timeTasks: []
        }
    },
    methods: {
        // Add your methods here
        LoadData() {
            RequestGETFromKliveAPI('/KMProfiles/GetAllProfiles').then((response) => {
                response.json().then((data) => {
                    this.timeTasks = data.map(task => ({
                        description: `${task.taskName} | Due: ${new Date(task.dateTimeDue).toLocaleDateString()} | Agent: ${task.agentName}${task.isImportant ? ' | ⭐ Important' : ''}`,
                        id: task.TaskID,
                        textColor: '#39489E',
                    }));
                });
            });
        }
    },
    mounted() {
        // Component mounted lifecycle hook
        this.LoadData();
        setInterval(() => { this.LoadData(); }, 5000);
    }
}
</script>

<style scoped>
/* Add your component styles here */
.km-profile-list {
    /* Styling rules */
}
</style>