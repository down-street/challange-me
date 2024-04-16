import {EXTENSION_ID} from './tokens';
export namespace CommandIDs {
    /**
     * Toggle cell attachments editor
     */
    export const toggleAttachments = `${EXTENSION_ID}:toggle-attachments`;
    /**
     * Toggle cell metadata editor
     */
    export const toggleMetadata = `${EXTENSION_ID}:toggle-metadata`;
    /**
     * Toggle cell toolbar
     */
    export const toggleToolbar = `${EXTENSION_ID}:toggle-toolbar`;
    /**
     * Toggle cell Raw NBConvert format
     */
    export const toggleRawFormat = `${EXTENSION_ID}:toggle-raw-format`;
    /**
     * Toggle cell slide type
     */
    export const toggleSlideType = `${EXTENSION_ID}:toggle-slide-type`;
    /**
     * Toggle cell tags
     */
    export const toggleTags = `${EXTENSION_ID}:toggle-tags`;
  
    export const getResponse = `${EXTENSION_ID}:get-response`;
  }