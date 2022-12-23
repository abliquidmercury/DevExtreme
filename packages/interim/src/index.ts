import registerComponent from './core/component_registrator';
import { compileGetter } from './core/utils/data';
import ComponentWrapper from './renovation/component_wrapper/common/component';
import type { ItemLike } from './ui/collection/ui.collection_widget.base';

export { registerComponent, ComponentWrapper, ItemLike, compileGetter };
export { getWindow } from './core/utils/window';