<img width="622" height="593" alt="image" src="https://github.com/user-attachments/assets/6c0c170e-7612-42a7-85ab-141b90a6e324" />

# Project Auditor

Project Auditor is an Adobe After Effects CEP extension designed to help clean up and audit large projects quickly.

It can detect common project issues, navigate directly to problematic items, and perform bulk cleanup operations to improve project organization.


### Version History

#### v1.0.0

* Initial release.
* Added random quotes displayed within the panel for a bit of fun while auditing projects.
## Features

### Composition Name Audit

* Find compositions containing spaces in their names.
* Automatically replace spaces with underscores (`_`).
* Helps maintain naming consistency across projects.

### Hidden Layer Detection

* Find all hidden layers in the project.
* Double-click any result to jump directly to the layer.
* Optionally include locked layers in the search.

### Hidden Effect Detection

* Find effects that are disabled or hidden.
* Navigate directly to the effect from the results list.
* Bulk delete unwanted effects.

### Effect Search

* Search for a specific effect name across the entire project.
* Quickly locate where an effect is being used.
* Double-click results to jump directly to the effect.

### Cleanup Tools

* Delete selected audit results.
* Delete all matching results in a single action.
* Refresh results automatically after cleanup.

### Navigation

* Double-click any result to instantly navigate to:

  * Composition
  * Layer
  * Effect

### Locked Layer Support

* Toggle whether locked layers should be included in searches.

### Automatic Update System

Project Auditor includes a built-in update system.


## Versioning

Project Auditor uses GitHub-hosted version checking.

When a new version is available, the panel will notify the user and allow updating directly from within After Effects.


## Installation

1. Download the latest release.

2. Extract the extension folder if the release is provided as a ZIP file.

3. Copy the Project Auditor folder to your CEP extensions directory:

   **Windows**

   ```
   C:\Program Files (x86)\Common Files\Adobe\CEP\extensions
   ```

   **macOS**

   ```
   /Library/Application Support/Adobe/CEP/extensions
   ```

4. Enable CEP debugging (required for unsigned extensions).

   **Windows**

   * Press `Win + R`, type `regedit`, and press Enter.
   * Navigate to:

     ```
     HKEY_CURRENT_USER\Software\Adobe\CSXS.11
     ```

     (If the key does not exist, create it. The number may vary depending on your Adobe version, such as CSXS.10, CSXS.11, or CSXS.12.)
   * Create a new String Value named:

     ```
     PlayerDebugMode
     ```
   * Set its value to:

     ```
     1
     ```

   **macOS**
   Open Terminal and run:

   ```bash
   defaults write com.adobe.CSXS.11 PlayerDebugMode 1
   ```

   Replace `11` with the CSXS version used by your Adobe installation if necessary.

5. Restart After Effects.

6. Launch After Effects.

7. Open **Window → Extensions → Project Auditor**. If the extension is installed correctly, the panel will appear and be ready to use.


## License

For user purpose only, made by Nam Dinh
