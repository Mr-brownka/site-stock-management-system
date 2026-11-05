/** Which look a company gets. Comex Builders keeps its own green and gold; every other company gets the blue Ostock look.
 *  The colours live in CSS variables under [data-brand] on the page, so pages built with them switch by themselves. */
import { useEffect } from 'react';

export const brandOf = (company: string) => (!company || /comex/i.test(company) ? 'comex' : 'ostock');

export function useBrand(company: string) {
  useEffect(() => { document.documentElement.dataset.brand = brandOf(company); }, [company]);
}
