<script setup lang="ts">
let assetSuffix = ''
// #ifdef H5
assetSuffix = '?v=3'
// #endif
withDefaults(defineProps<{ name: string; size?: number; light?: boolean }>(),{size:22,light:false})
</script>
<template><image :src="'/static/icons/'+name+'.svg'+assetSuffix" class="app-icon" :class="{light}" :style="{width:size+'px',height:size+'px'}" mode="aspectFit" aria-hidden="true" /></template>
<style scoped>.app-icon{display:inline-block;flex-shrink:0;vertical-align:middle}.light{filter:brightness(0) invert(1)}</style>
