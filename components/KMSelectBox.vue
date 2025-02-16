<template>
  <div class="select">
    <select :value="selected" @change="$emit('update:selected', $event.target.value); console.log('changed: '+$event.target.value)">
      <option
        v-for="option in options"
        :key="option"
        :value="option">
        {{ option }}
      </option>
    </select>
  </div>
</template>

<script>
export default {
  name: "KMSelectBox",
  props: {
    options: {
      type: Array,
      required: true
    },
    selected: {
      type: String,
      required: true
    }
  },
  watch: {
    options(newOptions) {
      if (newOptions && newOptions.length > 0) {
        this.$emit('update:selected', newOptions[0]);
      }
    }
  },
}
</script>

<style scoped>
:root {
  --background-gradient: linear-gradient(178deg, #ffff33 10%, #3333ff);
  --gray: #34495e;
  --darkgray: #2c3e50;
}

select {
  /* Reset Select */
  appearance: none;
  outline: 10px red;
  border: 0;
  box-shadow: none;
  /* Personalize */
  flex: 1;
  padding: 0 1em;
  color: #fff;
  background-color: var(--darkgray);
  background-image: none;
  cursor: pointer;
}
/* Remove IE arrow */
select::-ms-expand {
  display: none;
}
/* Custom Select wrapper */
.select {
  position: relative;
  display: flex;
  width: 20em;
  height: 3em;
  border-radius: .25em;
  overflow: hidden;
}
/* Arrow */
.select::after {
  content: '\25BC';
  position: absolute;
  top: 0;
  right: 0;
  padding: 1em;
  background-color: #34495e;
  transition: .25s all ease;
  pointer-events: none;
}
/* Transition */
.select:hover::after {
  color: #f39c12;
}

/* Other styles*/
body {
  color: #fff;
  background: var(--background-gradient);
}

a {
  font-weight: bold;
  color: var(--gray);
  text-decoration: drop-shadow;
  padding: .25em;
  border-radius: .50em;
  background: pink;
}

.container {
  position : absolute;
  top: 50%;
  left : 50%;
  transform : translate(-50%,-50%);
}

.down_note {
    display: flex;
    justify-content: center;
}
</style>