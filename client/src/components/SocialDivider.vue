<template>
  <!-- "or", between the form and the provider buttons — a rule and a word. -->
  <div
    role="separator"
    class="my-6 flex items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-muted before:h-px before:flex-1 before:bg-border before:content-[''] after:h-px after:flex-1 after:bg-border after:content-['']"
  >
    <span><slot>or</slot></span>
  </div>
</template>
