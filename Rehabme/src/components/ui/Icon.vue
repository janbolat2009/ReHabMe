<template>
  <svg class="icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="stroke" stroke-linecap="round" stroke-linejoin="round" :aria-hidden="label ? undefined : 'true'" :role="label ? 'img' : undefined" :aria-label="label" focusable="false">
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'
// Original, minimal stroke icon set (24px grid). Decorative unless `label` is set.
const ICONS = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5', 'M10 21v-6h4v6'],
  activity: ['M3 12h4l3-8 4 16 3-8h4'],
  chart: ['M4 20V4', 'M4 20h16', 'M8 16v-5', 'M12 16V8', 'M16 16v-3'],
  spark: ['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'M6 6l2.5 2.5', 'M15.5 15.5 18 18', 'M18 6l-2.5 2.5', 'M8.5 15.5 6 18'],
  chat: ['M4 5h16v11H9l-5 4z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6'],
  users: ['M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', 'M2.5 20c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5', 'M16 4.3a3.5 3.5 0 0 1 0 6.6', 'M18 15c2 .6 3.3 2.2 4 5'],
  bell: ['M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7', 'M10 20a2 2 0 0 0 4 0'],
  a11y: ['M12 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M5 8l7 1.5L19 8', 'M12 9.5V14', 'M12 14l-3 7', 'M12 14l3 7'],
  phone: ['M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z'],
  check: ['M4 12.5 9.5 18 20 6'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  right: ['M9 5l7 7-7 7'],
  left: ['M15 5l-7 7 7 7'],
  down: ['M5 9l7 7 7-7'],
  arrow: ['M4 12h16', 'M14 6l6 6-6 6'],
  play: ['M7 4.5v15l12-7.5z'],
  pause: ['M8 5v14', 'M16 5v14'],
  stop: ['M6 6h12v12H6z'],
  sound: ['M4 9h4l5-4v14l-5-4H4z', 'M16.5 8.5a5 5 0 0 1 0 7', 'M19 6a8.5 8.5 0 0 1 0 12'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 7.5v.5'],
  alert: ['M12 3 2.5 20h19z', 'M12 10v4', 'M12 17v.5'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  calendar: ['M4 6h16v15H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  brain: ['M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 3 3 0 0 0 3-3V7a3 3 0 0 0-3-3z', 'M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3 3 3 0 0 1-3-3'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  puzzle: ['M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H4z'],
  hand: ['M8 12V5.5a1.5 1.5 0 0 1 3 0V11', 'M11 10V4.5a1.5 1.5 0 0 1 3 0V11', 'M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2.5-4.5a1.5 1.5 0 0 1 2.6-1.5L8 14'],
  mic: ['M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
  heart: ['M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 6.5a4.5 4.5 0 0 1 8 3C20 15.4 12 20 12 20z'],
  shield: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z', 'M9 12l2 2 4-4'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 20h16'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  edit: ['M4 20h4L19 9l-4-4L4 16z'],
  refresh: ['M20 11a8 8 0 0 0-14.5-4.5L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.5 4.5L20 16', 'M20 20v-4h-4'],
  target: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 12h.01'],
  book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 21V5'],
  logout: ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h10'],
  sun: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 2v2', 'M12 20v2', 'M4 12H2', 'M22 12h-2', 'M5 5l1.5 1.5', 'M17.5 17.5 19 19', 'M19 5l-1.5 1.5', 'M6.5 17.5 5 19'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  pill: ['M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7z', 'M7 10.5l6.5 6.5'],
  flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  layers: ['M12 3 2 8l10 5 10-5z', 'M2 13l10 5 10-5'],
  steps: ['M4 18h5v-4h5v-4h6'],
}
const props = defineProps({ name: { type: String, required: true }, size: { type: [Number, String], default: 22 }, stroke: { type: [Number, String], default: 1.8 }, label: String })
const paths = computed(() => ICONS[props.name] ?? ICONS.info)
</script>
