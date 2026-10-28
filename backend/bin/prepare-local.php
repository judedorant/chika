<?php

// Only creates missing writable runtime directories; never changes permissions on existing files.
foreach (['storage/app/private', 'storage/framework/cache/data', 'storage/framework/sessions', 'storage/framework/views', 'storage/logs', 'bootstrap/cache'] as $directory) {
    if (! is_dir($directory) && ! mkdir($directory, 0775, true) && ! is_dir($directory)) {
        fwrite(STDERR, "Could not create a Laravel runtime directory.\n");
        exit(1);
    }
    if (! is_writable($directory)) {
        fwrite(STDERR, "A Laravel runtime directory is not writable.\n");
        exit(1);
    }
}
