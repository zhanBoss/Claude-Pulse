# Build Assets

This directory contains the application icons for different platforms.

## Required Icons

Please add the following icon files to enable proper packaging:

- `icon.icns` - macOS icon (512x512 or higher)
- `icon.ico` - Windows icon (256x256 or higher)
- `icon.png` - Linux icon (512x512 or higher)

## How to Generate Icons

You can use tools like:
- [electron-icon-builder](https://www.npmjs.com/package/electron-icon-builder)
- [Image2Icon](https://img2icns.com/) (online tool)
- Photoshop or GIMP

## Temporary Solution

If icons are not provided, electron-builder will use default icons, but this may cause warnings during the build process.
