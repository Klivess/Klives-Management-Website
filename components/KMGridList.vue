<template>
    <div class="list-container">
        <div class="list-item" v-for="item in items" :style="{ backgroundColor: buttonColor, border: '2px solid ' + buttonBorderColor}" :key="item.id" :onclick="item.click">
            <div :style="{color: item.textColor}">{{ item.name }}</div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'KMGridList',
    data() {
        return {
            items: []
        }
    },
    props: {
        // Define your component properties here
        items: {
            type: Array,
            required: true
        },
        // Color of button prop
        buttonColor: {
            type: String,
            default: '#4d9e39'
        },
        buttonBorderColor: {
            type: String,
            default: '#62ce47'
        },
        textColor: {
            type: String,
            default: '#ffffff'
        }
    },
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
    max-height: 100%;
    overflow-y: auto;
    padding: 10px;
    border: 1px solid #969696; /* $gray */
    border-radius: 5px;
    background-color: #201f20; /* $main */
}

.list-item {
    background-color: #4d9e39; /* $secondary */
    padding: 15px;
    border: 2px solid #62ce47; /* $teritary */
    border-radius: 5px;
    text-align: center;
    color: #ffffff; /* $white */
    transition: 0.2s;
}

.list-item:hover {
    background-color: #62ce47; /* $teritary */
    cursor: pointer;
    box-shadow:#4d9e39 0px 0px 10px;
    transition: 0.2s;
}
</style>