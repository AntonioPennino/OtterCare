import { $ } from '../utils';

export class InventoryView {
    public render(items: string[]): void {
        const contexts = [
            { list: $('inventoryList'), empty: $('inventoryEmpty') },
            { list: $('denGiftList'), empty: $('denGiftEmpty') }
        ] as const;

        contexts.forEach(context => {
            const list = context.list;
            const emptyState = context.empty;
            if (!list || !emptyState) {
                return;
            }

            list.replaceChildren();
            if (!items.length) {
                emptyState.classList.remove('hidden');
                list.classList.add('hidden');
                return;
            }

            emptyState.classList.add('hidden');
            list.classList.remove('hidden');

            const fragment = document.createDocumentFragment();
            items.forEach(item => {
                const li = document.createElement('li');
                li.setAttribute('role', 'listitem');
                li.textContent = item;
                fragment.appendChild(li);
            });
            list.appendChild(fragment);
        });
    }
}
