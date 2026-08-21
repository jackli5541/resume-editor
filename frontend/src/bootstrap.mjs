import { createApp, h } from "vue";

const registeredFeatures = new Map();
const mountedFeatures = new WeakMap();

function enabledByDataset(element, name) {
  return element.dataset.vueFeature === name && element.dataset.vueEnabled === "true";
}

export function registerVueFeature(name, component) {
  if (!name || typeof name !== "string") {
    throw new TypeError("Vue feature name must be a non-empty string");
  }
  if (!component) {
    throw new TypeError(`Vue feature \"${name}\" must provide a component`);
  }
  registeredFeatures.set(name, component);
}

export function mountVueFeature(element, { name, props = {}, enabled } = {}) {
  if (!(element instanceof Element)) return null;
  if (mountedFeatures.has(element)) return mountedFeatures.get(element);

  const shouldMount = enabled === true || (enabled === undefined && enabledByDataset(element, name));
  if (!shouldMount) return null;

  const component = registeredFeatures.get(name);
  if (!component) throw new Error(`Vue feature \"${name}\" is not registered`);

  const app = createApp({ render: () => h(component, props) });
  app.mount(element);
  mountedFeatures.set(element, app);
  return app;
}

export function unmountVueFeature(element) {
  const app = mountedFeatures.get(element);
  if (!app) return false;
  app.unmount();
  mountedFeatures.delete(element);
  return true;
}

export function mountEnabledVueFeatures(root = document) {
  const mounted = [];
  for (const element of root.querySelectorAll("[data-vue-feature][data-vue-enabled=\"true\"]")) {
    const app = mountVueFeature(element, { name: element.dataset.vueFeature });
    if (app) mounted.push(app);
  }
  return mounted;
}
