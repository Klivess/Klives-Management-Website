<template>
    <button ref="button" name="kmButton" style="height: 100%; width:100%;"><a>{{message}}</a></button>
</template>

<script>
export default {
    name: 'KMButton',
    props: {
        message: {
            type: String,
            required: true
        },
    },
      methods: {
    updateMessage(newMessage) {
      this.message = newMessage;
    }
  }
}
</script>