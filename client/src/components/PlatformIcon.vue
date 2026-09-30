<script setup lang="ts">
import {
  AtSign,
  Facebook,
  Instagram,
  Link2,
  Mail,
  MessagesSquare,
  Music2,
  Tv,
  Twitch,
  Youtube,
} from 'lucide-vue-next';
import type { Component } from 'vue';
import type { ChannelPlatform } from '../api/types';

/**
 * The glyph for a channel's platform.
 *
 * Lucide carries four of these as the real marks. The rest have no mark in the
 * set, so each gets the nearest plain glyph rather than a drawn-by-hand logo:
 * the platform's NAME is always printed beside this, and the icon is there to
 * give the row a shape, not to be the label.
 */
defineProps<{ platform: ChannelPlatform }>();

const ICONS: Record<ChannelPlatform, Component> = {
  twitch: Twitch,
  youtube: Youtube,
  instagram: Instagram,
  facebook: Facebook,
  email: Mail,
  discord: MessagesSquare,
  tiktok: Music2,
  kick: Tv,
  x: AtSign,
  other: Link2,
};
</script>

<template>
  <component :is="ICONS[platform]" aria-hidden="true" />
</template>
