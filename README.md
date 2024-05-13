# Challenge-me

A JupyterLab extension for code learning and performance improving.


## Requirements

-   JupyterLab >= 4.0

## Install

```bash
pip install .
```

## Uninstall

```bash
pip uninstall jlab-enhanced-cell-toolbar
```

## Development mode
```bash
# Clone the repo to your local environment
# Change directory to the jlab_enhanced_cell_toolbar directory
# Install package in development mode
pip install -e .
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Rebuild extension Typescript source after making changes
jlpm run build
```

You can watch the source directory and run JupyterLab at the same time in different terminals to watch for changes in the extension's source and automatically rebuild the extension.

```bash
# Watch the source directory in one terminal, automatically rebuilding when needed
jlpm run watch
# Run JupyterLab in another terminal
jupyter lab
```

With the watch command running, every saved change will immediately be built locally and available in your running JupyterLab. Refresh JupyterLab to load the change in your browser (you may need to wait several seconds for the extension to be rebuilt).