import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

/**
 * Initialization data for the @jlab-enhanced/cell-toolbar extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jlab-enhanced/cell-toolbar:plugin',
  description: 'A cell toolbar for JupyterLab.',
  autoStart: true,
  optional: [ISettingRegistry],
  activate: (app: JupyterFrontEnd, settingRegistry: ISettingRegistry | null) => {
    console.log('JupyterLab extension @jlab-enhanced/cell-toolbar is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('@jlab-enhanced/cell-toolbar settings loaded:', settings.composite);
        })
        .catch(reason => {
          console.error('Failed to load settings for @jlab-enhanced/cell-toolbar.', reason);
        });
    }
  }
};

export default plugin;
