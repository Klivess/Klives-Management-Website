<template>
<label class="toggle" for="uniqueID">
			<input id="uniqueID" type="checkbox" ref="checkBox" class="toggle__input" :oninput="onInput"/>
			<span class="toggle-track">
				<span class="toggle-indicator">
					<!-- 	This check mark is optional	 -->
					<span class="checkMark">
						<svg viewBox="0 0 24 24" id="ghq-svg-check" role="presentation" aria-hidden="true">
							<path d="M9.86 18a1 1 0 01-.73-.32l-4.86-5.17a1.001 1.001 0 011.46-1.37l4.12 4.39 8.41-9.2a1 1 0 111.48 1.34l-9.14 10a1 1 0 01-.73.33h-.01z"></path>
						</svg>
					</span>
				</span>
			</span>
			{{message}}
		</label>
</template>

<script>
export default {
    name: 'KMCheckBox',
	props: {
        message: {
            type: String,
            default: ""
        },
		checked: {
			type: Boolean,
			default: false
		}
	},
    methods: {
		onInput(){
			this.$props.checked = !this.$props.checked;
			alert(this.checked);
		}
    },
	mounted() {
		//Change the checked value to the value passed in the checked prop
		this.$refs.checkBox.checked = this.$props.checked;
	}
}
</script>

<style lang="scss">
$toggle-indicator-size: 24px; // changing this number will resize the whole toggle
$track-height: $toggle-indicator-size + 6;
$track-width: $toggle-indicator-size * 2.5;
$highContrastModeSupport: solid 2px transparent;

$mid: #4d9e39;
$light: #62ce47;
$dark: #201f20;
$speed: 0.2s;

$track-border: $mid;
$track-background: $light;
$focus-ring: 0px 0px 0px 2px $dark;

// Toggle specific styles
.toggle {
	align-items: center;
	border-radius: 100px;
	display: flex;
	font-weight: 700;
	margin-bottom: 16px;

	&:last-of-type {
		margin: 0;
	}
}

// Since we can't style the checkbox directly, we "hide" it so we can draw the toggle.
.toggle__input {
	clip: rect(0 0 0 0);
	clip-path: inset(50%);
	height: 1px;
	overflow: hidden;
	position: absolute;
	white-space: nowrap;
	width: 1px;

	// This style sets the focus ring. The ":not([disabled])" prevents the focus ring from creating a flash when the element is clicked.
	&:not([disabled]):active + .toggle-track,
	&:not([disabled]):focus + .toggle-track {
		border: 1px solid transparent;
		box-shadow: $focus-ring;
	}

	&:disabled + .toggle-track {
		cursor: not-allowed;
		opacity: 0.7;
	}
}

.toggle-track {
	background: $track-background;
	border: 1px solid $track-border;
	border-radius: 100px;
	cursor: pointer;
	display: flex;
	height: $track-height;
	margin-right: 12px;
	position: relative;
	width: $track-width;
}

.toggle-indicator {
	align-items: center;
	background: $dark;
	border-radius: $toggle-indicator-size;
	bottom: 2px;
	display: flex;
	height: $toggle-indicator-size;
	justify-content: center;
	left: 2px;
	outline: $highContrastModeSupport;
	position: absolute;
	transition: $speed;
	width: $toggle-indicator-size;
}

// The check mark is optional
.checkMark {
	fill: #fff;
	height: $toggle-indicator-size - 4;
	width: $toggle-indicator-size - 4;
	opacity: 0;
	transition: opacity $speed ease-in-out;
}

.toggle__input:checked + .toggle-track .toggle-indicator {
	background: $dark;
	transform: translateX($track-width - $track-height);

	.checkMark {
		opacity: 1;
		transition: opacity $speed ease-in-out;
	}
}

@media screen and (-ms-high-contrast: active) {
	.toggle-track {
		border-radius: 0;
	}
}
</style>