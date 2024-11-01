<template>
    <div class="list-container">
        <div class="list-item" v-for="item in items" :key="item.id">
            {{ item.name }}
        </div>
    </div>
</template>

<script>
export default {
    name: 'KMGridList',
    data() {
        return {
            items: [
                { id: 1, name: 'Item 1' },
                { id: 2, name: 'Item 2' },
                { id: 3, name: 'Item 3' },
                { id: 4, name: 'Item 4' },
                { id: 5, name: 'Item 5' },
                { id: 6, name: 'Item 6' },
                { id: 7, name: 'Item 7' },
                { id: 8, name: 'Item 8' },
                { id: 9, name: 'Item 9' },
                { id: 10, name: 'Item 10' },
                { id: 11, name: 'Item 11' },
                { id: 12, name: 'Item 12' },
                { id: 13, name: 'Item 13' },
                { id: 14, name: 'Item 14' },
                { id: 15, name: 'Item 15' },
                { id: 16, name: 'Item 16' },
                { id: 17, name: 'Item 17' },
                { id: 18, name: 'Item 18' },
                { id: 19, name: 'Item 19' },
                { id: 20, name: 'Item 20' }
            ]
        }
    }
};
</script>

<style scoped>
/* Custom scrollbar styles */
.list-container::-webkit-scrollbar {
    width: 12px;
}

.list-container::-webkit-scrollbar-track {
    background: #201f20; /* $main */
    border-radius: 5px;
}

.list-container::-webkit-scrollbar-thumb {
    background-color: #4d9e39; /* $secondary */
    border-radius: 5px;
    border: 3px solid #201f20; /* $main */
}

.list-container {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 400px;
    overflow-y: auto;
    padding: 10px;
    border: 1px solid #969696; /* $gray */
    border-radius: 5px;
    background-color: #201f20; /* $main */
}

.list-item {
    background-color: #4d9e39; /* $secondary */
    padding: 15px;
    border: 1px solid #62ce47; /* $teritary */
    border-radius: 5px;
    text-align: center;
    color: #ffffff; /* $white */
}
</style>