<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <section class="band">
    <div class="band-inner text-center">
      <p class="display text-[clamp(96px,22vw,220px)] leading-none text-accent">404</p>
      <h1 class="display mt-2 text-4xl sm:text-5xl">Wrong door</h1>
      <p class="mx-auto mt-4 max-w-[40ch] text-muted">
        There is nothing at this address. It may have moved, or it may never have been here.
      </p>
      <RouterLink to="/" class="btn mt-8">Back to the front page</RouterLink>
    </div>
  </section>
</template>
