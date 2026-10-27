<script setup lang="ts">
defineProps<{ index: number; locked?: boolean }>()
</script>
<template>
  <view class="fish-art" :class="{locked}">
    <image v-if="index >= 0" class="fish-sheet" src="/static/fish-atlas.webp" :style="{left:(index%2 ? '-100%' : '0'),top:(index>1 ? '-100%':'0')}" mode="scaleToFill" aria-hidden="true" />
    <image v-else src="/static/icons/fish.svg" class="unknown-fish" mode="aspectFit" aria-hidden="true" />
  </view>
</template>
<style scoped>
.fish-art{position:relative;width:100%;aspect-ratio:1;overflow:hidden}.fish-sheet{position:absolute;width:200%;height:200%;max-width:none}.locked{filter:grayscale(1);opacity:.28}.unknown-fish{width:55%;height:55%;margin:22.5%;opacity:.25}
</style>
