<script setup lang="ts">
import { Check, Copy, Plus } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { errorMessage } from '@/api/client';
import { adminApiClients, type ApiClient } from '@/api/api-clients';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * The keys this site has issued to other servers — today, the Email Templates
 * tool in My Company Tools. Create shows the secret once; Revoke refuses every
 * token minted from the key at once.
 */
const items = ref<ApiClient[]>([]);
const scopes = ref<string[]>([]);
const loading = ref(true);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const response = await adminApiClients.list();
    items.value = response.items;
    scopes.value = response.scopes;
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const creating = ref(false);
const name = ref('');
const chosen = ref<Record<string, boolean>>({});
const saving = ref(false);
const canCreate = computed(() => name.value.trim().length >= 2 && Object.values(chosen.value).some(Boolean));

function openCreate() {
  name.value = '';
  chosen.value = Object.fromEntries(scopes.value.map((scope) => [scope, true]));
  creating.value = true;
}

/** What the create dialog turns into once the server answers. */
const issued = ref<{ item: ApiClient; secret: string } | null>(null);
const copied = ref<'address' | 'id' | 'secret' | null>(null);

async function create() {
  saving.value = true;
  error.value = '';
  try {
    const picked = scopes.value.filter((scope) => chosen.value[scope]);
    issued.value = await adminApiClients.create({ name: name.value.trim(), scopes: picked });
    creating.value = false;
    items.value = [issued.value.item, ...items.value];
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    saving.value = false;
  }
}

async function copy(value: string, which: 'address' | 'id' | 'secret') {
  try {
    await navigator.clipboard.writeText(value);
    copied.value = which;
    setTimeout(() => (copied.value = null), 1500);
  } catch {
    /* the field is selectable; the person can copy by hand */
  }
}

const pendingRevoke = ref<ApiClient | null>(null);
async function confirmRevoke() {
  const doomed = pendingRevoke.value;
  pendingRevoke.value = null;
  if (!doomed) return;
  error.value = '';
  try {
    const saved = await adminApiClients.revoke(doomed.id);
    items.value = items.value.map((row) => (row.id === saved.id ? saved : row));
  } catch (caught) {
    error.value = errorMessage(caught);
    await load();
  }
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

/** What the Email Templates tool asks for as the API address: this site's origin plus /api. */
const apiAddress = `${window.location.origin}/api`;
</script>

<template>
  <header class="flex flex-wrap items-center justify-between gap-4">
    <h1 class="display text-3xl">API access</h1>
    <Button variant="default" size="sm" @click="openCreate"><Plus aria-hidden="true" /> New key</Button>
  </header>
  <p class="mt-3 max-w-prose text-sm text-muted">
    Keys let another server — the Email Templates tool in My Company Tools — sign in to this
    site's API as itself. Paste the API address shown below, then the id and secret, into that tool's Settings. Revoking a key
    stops every token it minted at once.
  </p>

  <div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
    <span class="text-muted">API address for the tool</span>
    <code class="rounded border px-2 py-1 text-xs">{{ apiAddress }}</code>
    <Button variant="outline" size="icon" aria-label="Copy API address" @click="copy(apiAddress, 'address')">
      <Check v-if="copied === 'address'" /><Copy v-else />
    </Button>
  </div>

  <p
    v-if="error"
    role="alert"
    class="mt-5 border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger-ink"
  >
    {{ error }}
  </p>

  <Table class="mt-7">
    <TableHeader>
      <TableRow>
        <TableHead class="kicker">Name</TableHead>
        <TableHead class="kicker">Client id</TableHead>
        <TableHead class="kicker">Scopes</TableHead>
        <TableHead class="kicker w-40">Last used</TableHead>
        <TableHead class="kicker w-32">Status</TableHead>
        <TableHead class="w-24" />
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow v-for="item in items" :key="item.id" :class="item.revokedAt ? 'opacity-60' : ''">
        <TableCell class="whitespace-normal">
          {{ item.name }}
          <span class="block text-xs text-muted">Created {{ when(item.createdAt) }}</span>
        </TableCell>
        <TableCell>
          <code class="text-xs">{{ item.clientId }}</code>
          <span class="block text-xs text-muted">secret …{{ item.secretLast4 }}</span>
        </TableCell>
        <TableCell class="whitespace-normal text-xs">{{ item.scopes.join(', ') }}</TableCell>
        <TableCell class="text-xs">{{ when(item.lastUsedAt) }}</TableCell>
        <TableCell class="text-xs">
          <span v-if="item.revokedAt" class="text-danger">Revoked {{ when(item.revokedAt) }}</span>
          <span v-else>Active</span>
        </TableCell>
        <TableCell class="text-right">
          <Button
            v-if="!item.revokedAt"
            variant="ghost"
            size="sm"
            class="text-danger"
            @click="pendingRevoke = item"
            >Revoke</Button
          >
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>

  <p v-if="loading" class="py-10 text-sm text-muted">Loading…</p>
  <p v-else-if="!items.length && !error" class="py-10 text-sm text-muted">No keys issued yet.</p>

  <!-- Create -->
  <Dialog :open="creating" @update:open="(open) => !open && (creating = false)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New API key</DialogTitle>
        <DialogDescription>
          Name it after what will hold it. The secret is shown once, on the next screen.
        </DialogDescription>
      </DialogHeader>
      <div class="grid gap-4">
        <div class="grid gap-2">
          <Label for="key-name">Name</Label>
          <Input id="key-name" v-model="name" placeholder="My Company Tools — Email Templates" />
        </div>
        <fieldset class="grid gap-2">
          <legend class="text-sm font-medium">Scopes</legend>
          <label v-for="scope in scopes" :key="scope" class="flex items-center gap-3 text-sm">
            <Switch
              :model-value="chosen[scope] === true"
              @update:model-value="(value: boolean) => (chosen[scope] = value)"
            />
            <code>{{ scope }}</code>
          </label>
        </fieldset>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="creating = false">Cancel</Button>
        <Button variant="default" :disabled="!canCreate || saving" @click="create">Create key</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- The one time the secret is visible -->
  <Dialog :open="issued !== null" @update:open="(open) => !open && (issued = null)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Copy the secret now</DialogTitle>
        <DialogDescription>
          It is not stored anywhere and cannot be shown again. If it is lost, revoke this key
          and create another.
        </DialogDescription>
      </DialogHeader>
      <div v-if="issued" class="grid gap-4">
        <div class="grid gap-2">
          <Label>API address</Label>
          <div class="flex gap-2">
            <Input :model-value="apiAddress" readonly class="font-mono text-xs" />
            <Button variant="outline" size="icon" aria-label="Copy API address" @click="copy(apiAddress, 'address')">
              <Check v-if="copied === 'address'" /><Copy v-else />
            </Button>
          </div>
        </div>
        <div class="grid gap-2">
          <Label>Client id</Label>
          <div class="flex gap-2">
            <Input :model-value="issued.item.clientId" readonly class="font-mono text-xs" />
            <Button variant="outline" size="icon" aria-label="Copy client id" @click="copy(issued.item.clientId, 'id')">
              <Check v-if="copied === 'id'" /><Copy v-else />
            </Button>
          </div>
        </div>
        <div class="grid gap-2">
          <Label>Client secret</Label>
          <div class="flex gap-2">
            <Input :model-value="issued.secret" readonly class="font-mono text-xs" />
            <Button variant="outline" size="icon" aria-label="Copy secret" @click="copy(issued.secret, 'secret')">
              <Check v-if="copied === 'secret'" /><Copy v-else />
            </Button>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="default" @click="issued = null">Done</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Revoke -->
  <Dialog :open="pendingRevoke !== null" @update:open="(open) => !open && (pendingRevoke = null)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Revoke this key?</DialogTitle>
        <DialogDescription>
          “{{ pendingRevoke?.name }}” stops working immediately, including any token it has
          already been given. This cannot be undone; create a new key to restore access.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="pendingRevoke = null">Cancel</Button>
        <Button variant="destructive" @click="confirmRevoke">Revoke</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
