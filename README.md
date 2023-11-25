Run this script with global NODE_PATH env variable pointing to the global npm dir.

Did this so that I wouldn't have to add node_modules here and unnecessarily sync it to OneDrive

```sh
export NODE_PATH=$(npm root --quiet -g)
```
