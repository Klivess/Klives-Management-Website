<template>
    <input
      class="kinput"
      :type="type"
      :placeholder="placeholder"
      :value="value"
      @input="$emit('update:value', $event.target.value);"
    />
  </template>
  
  <script>

  export default {
    name: 'KMInputBox',
    props: {
      value: {
        type: String,
        default: '',
      },
      type: {
        type: String,
        default: 'text',
      },
      placeholder: {
        type: String,
        default: '',
      },
    },
  }

  </script>