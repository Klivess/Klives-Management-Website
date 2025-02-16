<template>
    <button ref="button" name="kmButton" style="height: 100%; width:100%;"><a :style="{color: textColor}">{{message}}</a></button>
</template>

<script>
export default {
    name: 'KMButton',
    props: {
        message: {
            type: String,
            required: true
        },
        textColor:{
            type: String,
            default: '#4d9e39'
        }
    },
      methods: {
    updateMessage(newMessage) {
      this.message = newMessage;
    }
  }
}
</script>