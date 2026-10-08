# Third-party licenses

MUI is under the [GNU Affero General Public License 3.0](LICENSE) (see
[NOTICE](NOTICE)). Some of its files and the libraries
built into the add-on are under other licenses; this file lists them and holds
their license texts. It is part of the add-on archive.

## Data from the CCU's WebUI (Apache License 2.0)

These files are extracted from the WebUI of eQ-3's CCU (OCCU), as published in
[OpenCCU-Base](https://github.com/OpenCCU/OpenCCU-Base) (`src/webui`,
`webui`) with the WebUI patches of [OpenCCU](https://github.com/OpenCCU/OpenCCU)
laid over it. They are converted to JSON by the scripts named below and are not
under MIT but under the Apache License 2.0, like their source:

| Files | Taken from | Script |
|---|---|---|
| `src/controls/links/profiles/*.json` | the direct link profiles in `www/config/easymodes/**` and their texts in `localization/*` and `translate.lang.option.js` | `scripts/import-link-profiles.mjs` |
| `src/controls/generic/parameterLabels.json` | the parameter names in `webui/js/lang/*/translate.lang*.js` and `webui.js` | `scripts/import-parameter-labels.mjs` |
| `src/components/serviceMessages/texts.json`, `go-server/pkg/push/servicetexts.json` | the service message texts in `config/stringtable_de.txt` and `translate.lang*.js` | `scripts/import-service-texts.mjs` |

Changes: profile names, parameter values and the German and English texts are
read from the Tcl and JavaScript sources and written as JSON; nothing else of
the WebUI is copied. The app and the Go server ship these files in the add-on.

Copyright eQ-3 AG and the OpenCCU contributors. Homematic and Homematic IP are
trademarks of eQ-3 AG; MUI is not affiliated with eQ-3 or OpenCCU.

## Libraries in the add-on

The Go server (`go-server`) is built with:

| Module | License |
|---|---|
| [github.com/gorilla/websocket](https://github.com/gorilla/websocket) v1.5.3 | BSD-2-Clause |
| [github.com/kolo/xmlrpc](https://github.com/kolo/xmlrpc) | MIT |
| [github.com/rogpeppe/go-charset](https://github.com/rogpeppe/go-charset) | BSD-3-Clause |

The app (`dist`) bundles these npm packages and their dependencies; each
package's own license file is in its published package:

| Package | Version | License |
|---|---|---|
| @floating-ui/core | 1.8.0 | MIT |
| @floating-ui/dom | 1.8.0 | MIT |
| @floating-ui/react-dom | 2.1.9 | MIT |
| @floating-ui/utils | 0.2.12 | MIT |
| @fontsource-variable/geist | 5.3.0 | OFL-1.1 |
| @fontsource-variable/geist-mono | 5.3.0 | OFL-1.1 |
| @radix-ui/number | 1.1.3 | MIT |
| @radix-ui/primitive | 1.1.7 | MIT |
| @radix-ui/react-accessible-icon | 1.1.15 | MIT |
| @radix-ui/react-accordion | 1.2.20 | MIT |
| @radix-ui/react-alert-dialog | 1.1.23 | MIT |
| @radix-ui/react-arrow | 1.1.15 | MIT |
| @radix-ui/react-aspect-ratio | 1.1.15 | MIT |
| @radix-ui/react-avatar | 1.2.6 | MIT |
| @radix-ui/react-checkbox | 1.3.11 | MIT |
| @radix-ui/react-collapsible | 1.1.20 | MIT |
| @radix-ui/react-collection | 1.1.15 | MIT |
| @radix-ui/react-compose-refs | 1.1.5 | MIT |
| @radix-ui/react-context | 1.2.2 | MIT |
| @radix-ui/react-context-menu | 2.3.7 | MIT |
| @radix-ui/react-dialog | 1.1.23 | MIT |
| @radix-ui/react-direction | 1.1.4 | MIT |
| @radix-ui/react-dismissable-layer | 1.1.19 | MIT |
| @radix-ui/react-dropdown-menu | 2.1.24 | MIT |
| @radix-ui/react-focus-guards | 1.1.6 | MIT |
| @radix-ui/react-focus-scope | 1.1.16 | MIT |
| @radix-ui/react-form | 0.1.16 | MIT |
| @radix-ui/react-hover-card | 1.1.23 | MIT |
| @radix-ui/react-id | 1.1.4 | MIT |
| @radix-ui/react-label | 2.1.15 | MIT |
| @radix-ui/react-menu | 2.1.24 | MIT |
| @radix-ui/react-menubar | 1.1.24 | MIT |
| @radix-ui/react-navigation-menu | 1.2.22 | MIT |
| @radix-ui/react-one-time-password-field | 0.1.16 | MIT |
| @radix-ui/react-password-toggle-field | 0.1.11 | MIT |
| @radix-ui/react-popover | 1.1.23 | MIT |
| @radix-ui/react-popper | 1.3.7 | MIT |
| @radix-ui/react-portal | 1.1.17 | MIT |
| @radix-ui/react-presence | 1.1.10 | MIT |
| @radix-ui/react-primitive | 2.1.10 | MIT |
| @radix-ui/react-progress | 1.1.16 | MIT |
| @radix-ui/react-radio-group | 1.4.7 | MIT |
| @radix-ui/react-roving-focus | 1.1.19 | MIT |
| @radix-ui/react-scroll-area | 1.2.18 | MIT |
| @radix-ui/react-select | 2.3.7 | MIT |
| @radix-ui/react-separator | 1.1.15 | MIT |
| @radix-ui/react-slider | 1.4.7 | MIT |
| @radix-ui/react-slot | 1.3.3 | MIT |
| @radix-ui/react-switch | 1.3.7 | MIT |
| @radix-ui/react-tabs | 1.1.21 | MIT |
| @radix-ui/react-toast | 1.2.23 | MIT |
| @radix-ui/react-toggle | 1.1.18 | MIT |
| @radix-ui/react-toggle-group | 1.1.19 | MIT |
| @radix-ui/react-toolbar | 1.1.19 | MIT |
| @radix-ui/react-tooltip | 1.2.16 | MIT |
| @radix-ui/react-use-callback-ref | 1.1.4 | MIT |
| @radix-ui/react-use-controllable-state | 1.2.6 | MIT |
| @radix-ui/react-use-effect-event | 0.0.5 | MIT |
| @radix-ui/react-use-escape-keydown | 1.1.5 | MIT |
| @radix-ui/react-use-is-hydrated | 0.1.3 | MIT |
| @radix-ui/react-use-layout-effect | 1.1.4 | MIT |
| @radix-ui/react-use-previous | 1.1.4 | MIT |
| @radix-ui/react-use-rect | 1.1.4 | MIT |
| @radix-ui/react-use-size | 1.1.4 | MIT |
| @radix-ui/react-visually-hidden | 1.2.11 | MIT |
| @radix-ui/rect | 1.1.3 | MIT |
| @tanstack/history | 1.162.4 | MIT |
| @tanstack/query-core | 5.104.1 | MIT |
| @tanstack/react-query | 5.104.1 | MIT |
| @tanstack/react-router | 1.170.40 | MIT |
| @tanstack/react-store | 0.11.1 | MIT |
| @tanstack/react-table | 8.21.3 | MIT |
| @tanstack/router-core | 1.171.33 | MIT |
| @tanstack/store | 0.11.1 | MIT |
| @tanstack/table-core | 8.21.3 | MIT |
| @types/react | 19.3.0 | MIT |
| @types/react-dom | 19.3.0 | MIT |
| aria-hidden | 1.2.6 | MIT |
| class-variance-authority | 0.7.1 | Apache-2.0 |
| clsx | 2.1.1 | MIT |
| cookie-es | 3.1.1 | MIT |
| csstype | 3.2.3 | MIT |
| detect-node-es | 1.1.0 | MIT |
| fast-equals | 4.0.3 | MIT |
| get-nonce | 1.0.1 | MIT |
| isbot | 5.2.2 | Unlicense |
| js-tokens | 4.0.0 | MIT |
| loose-envify | 1.4.0 | MIT |
| object-assign | 4.1.1 | MIT |
| prop-types | 15.8.1 | MIT |
| radix-ui | 1.6.7 | MIT |
| react | 19.3.0 | MIT |
| react-dom | 19.3.0 | MIT |
| react-draggable | 4.7.2 | MIT |
| react-grid-layout | 2.2.4 | MIT |
| react-is | 16.13.1 | MIT |
| react-remove-scroll | 2.7.2 | MIT |
| react-remove-scroll-bar | 2.3.8 | MIT |
| react-resizable | 3.2.0 | MIT |
| react-style-singleton | 2.2.3 | MIT |
| react-use-websocket | 4.13.0 | MIT |
| resize-observer-polyfill | 1.5.1 | MIT |
| scheduler | 0.28.0 | MIT |
| seroval | 1.6.7 | MIT |
| seroval-plugins | 1.6.7 | MIT |
| tailwind-merge | 3.7.0 | MIT |
| tslib | 2.8.1 | 0BSD |
| tw-animate-css | 1.4.0 | MIT |
| use-callback-ref | 1.3.3 | MIT |
| use-sidecar | 1.1.3 | MIT |
| use-sync-external-store | 1.7.0 | MIT |

The fonts Geist and Geist Mono (`@fontsource-variable/geist`,
`@fontsource-variable/geist-mono`): Copyright 2024 The Geist Project Authors
(https://github.com/vercel/geist-font), SIL Open Font License 1.1.

## License texts

### Apache License 2.0

```
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS
```

### SIL Open Font License 1.1

```
-----------------------------------------------------------
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```

### github.com/gorilla/websocket (BSD-2-Clause)

```
Copyright (c) 2013 The Gorilla WebSocket Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

  Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

  Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

### github.com/kolo/xmlrpc (MIT)

```
Copyright (C) 2012 Dmitry Maksimov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

### github.com/rogpeppe/go-charset (BSD-3-Clause)

```
Copyright (c) 2009 The go-charset Authors. All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are
met:

   * Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.
   * Redistributions in binary form must reproduce the above
copyright notice, this list of conditions and the following disclaimer
in the documentation and/or other materials provided with the
distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
"AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
