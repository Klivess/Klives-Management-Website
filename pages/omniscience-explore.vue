<template>
    <div></div>
</template>

<script setup lang="ts">
// The explorer's tabs became views of the Omniscience console; each old link lands on the view that replaced it.
const route = useRoute();
const text = (name: string) => String(route.query[name] ?? '');

function target(): Record<string, string> {
    const person = text('personId');
    switch (text('tab')) {
        case 'Health': return { view: 'engine' };
        case 'Compare': return text('left') && text('right') ? { view: 'people', compare: `${text('left')},${text('right')}` } : { view: 'people' };
        case 'Network': return person ? { view: 'person', id: person, tab: 'circle' } : { view: 'people' };
        case 'Timeline': return person ? { view: 'person', id: person, tab: 'activity' } : { view: 'people' };
    }
    if (text('saved')) return { view: 'ask', saved: text('saved') };
    if (text('scope')) {
        // An old "jump back in" link carried the whole search as JSON.
        try {
            const scope = JSON.parse(text('scope'));
            const q: Record<string, string> = { view: 'ask', mode: 'scope' };
            if (scope?.q) q.q = String(scope.q);
            if (scope?.personId) q.person = String(scope.personId);
            if (scope?.conversationId) q.c = String(scope.conversationId);
            return q;
        } catch { /* not JSON: fall through to the plain Ask view */ }
    }
    return { view: 'ask' };
}

await navigateTo({ path: '/omniscience', query: target() }, { replace: true });
</script>
