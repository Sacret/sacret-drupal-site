(function($) {

Drupal.wysiwyg.editor.init.ckeditor = function(settings) {
  // Plugins must only be loaded once. Only the settings from the first format
  // will be used but they're identical anyway.
  var registeredPlugins = {};
  for (var format in settings) {
    if (Drupal.settings.wysiwyg.plugins[format]) {
      // Register native external plugins.
      // Array syntax required; 'native' is a predefined token in JavaScript.
      for (var pluginName in Drupal.settings.wysiwyg.plugins[format]['native']) {
        if (!registeredPlugins[pluginName]) {
          var plugin = Drupal.settings.wysiwyg.plugins[format]['native'][pluginName];
          CKEDITOR.plugins.addExternal(pluginName, plugin.path, plugin.fileName);
          registeredPlugins[pluginName] = true;
        }
      }
      // Register Drupal plugins.
      for (var pluginName in Drupal.settings.wysiwyg.plugins[format].drupal) {
        if (!registeredPlugins[pluginName]) {
          Drupal.wysiwyg.editor.instance.ckeditor.addPlugin(pluginName, Drupal.settings.wysiwyg.plugins[format].drupal[pluginName], Drupal.settings.wysiwyg.plugins.drupal[pluginName]);
          registeredPlugins[pluginName] = true;
        }
      }
    }
    // Register Font styles (versions 3.2.1 and above).
    if (Drupal.settings.wysiwyg.configs.ckeditor[format].stylesSet) {
      CKEDITOR.stylesSet.add(format, Drupal.settings.wysiwyg.configs.ckeditor[format].stylesSet);
    }
  }
};


/**
 * Attach this editor to a target element.
 */
Drupal.wysiwyg.editor.attach.ckeditor = function(context, params, settings) {
  // Apply editor instance settings.
  CKEDITOR.config.customConfig = '';

  var $drupalToolbar = $('#toolbar', Drupal.overlayChild ? window.parent.document : document);

  settings.on = {
    instanceReady: function(ev) {
      var editor = ev.editor;
      // Get a list of block, list and table tags from CKEditor's XHTML DTD.
      // @see http://docs.cksource.com/CKEditor_3.x/Developers_Guide/Output_Formatting.
      var dtd = CKEDITOR.dtd;
      var tags = CKEDITOR.tools.extend({}, dtd.$block, dtd.$listItem, dtd.$tableContent);
      // Set source formatting rules for each listed tag except <pre>.
      // Linebreaks can be inserted before or after opening and closing tags.
      if (settings.apply_source_formatting) {
        // Mimic FCKeditor output, by breaking lines between tags.
        for (var tag in tags) {
          if (tag == 'pre') {
            continue;
          }
          this.dataProcessor.writer.setRules(tag, {
            indent: true,
            breakBeforeOpen: true,
            breakAfterOpen: false,
            breakBeforeClose: false,
            breakAfterClose: true
          });
        }
      }
      else {
        // CKEditor adds default formatting to <br>, so we want to remove that
        // here too.
        tags.br = 1;
        // No indents or linebreaks;
        for (var tag in tags) {
          if (tag == 'pre') {
            continue;
          }
          this.dataProcessor.writer.setRules(tag, {
            indent: false,
            breakBeforeOpen: false,
            breakAfterOpen: false,
            breakBeforeClose: false,
            breakAfterClose: false
          });
        }
      }
    },

    pluginsLoaded: function(ev) {
      // Override the conversion methods to let Drupal plugins modify the data.
      var editor = ev.editor;
      if (editor.dataProcessor && Drupal.settings.wysiwyg.plugins[params.format]) {
        editor.dataProcessor.toHtml = CKEDITOR.tools.override(editor.dataProcessor.toHtml, function(originalToHtml) {
          // Convert raw data for display in WYSIWYG mode.
          return function(data, fixForBody) {
            for (var plugin in Drupal.settings.wysiwyg.plugins[params.format].drupal) {
              if (typeof Drupal.wysiwyg.plugins[plugin].attach == 'function') {
                data = Drupal.wysiwyg.plugins[plugin].attach(data, Drupal.settings.wysiwyg.plugins.drupal[plugin], editor.name);
                data = Drupal.wysiwyg.instances[params.field].prepareContent(data);
              }
            }
            return originalToHtml.call(this, data, fixForBody);
          };
        });
        editor.dataProcessor.toDataFormat = CKEDITOR.tools.override(editor.dataProcessor.toDataFormat, function(originalToDataFormat) {
          // Convert WYSIWYG mode content to raw data.
          return function(data, fixForBody) {
            data = originalToDataFormat.call(this, data, fixForBody);
            for (var plugin in Drupal.settings.wysiwyg.plugins[params.format].drupal) {
              if (typeof Drupal.wysiwyg.plugins[plugin].detach == 'function') {
                data = Drupal.wysiwyg.plugins[plugin].detach(data, Drupal.settings.wysiwyg.plugins.drupal[plugin], editor.name);
              }
            }
            return data;
          };
        });
      }
    },

    selectionChange: function (event) {
      var pluginSettings = Drupal.settings.wysiwyg.plugins[params.format];
      if (pluginSettings && pluginSettings.drupal) {
        $.each(pluginSettings.drupal, function (name) {
          var plugin = Drupal.wysiwyg.plugins[name];
          if ($.isFunction(plugin.isNode)) {
            var node = event.data.selection.getSelectedElement();
            var state = plugin.isNode(node ? node.$ : null) ? CKEDITOR.TRISTATE_ON : CKEDITOR.TRISTATE_OFF;
            event.editor.getCommand(name).setState(state);
          }
        });
      }
    },

    focus: function(ev) {
      Drupal.wysiwyg.activeId = ev.editor.name;
    },

    afterCommandExec: function(ev) {
      // Fix Drupal toolbar obscuring editor toolbar in fullscreen mode.
      if (ev.data.name != 'maximize') {
        return;
      }
      if (ev.data.command.state == CKEDITOR.TRISTATE_ON) {
        $drupalToolbar.hide();
      }
      else {
        $drupalToolbar.show();
      }
    }
  };

  // Attach editor.
  CKEDITOR.replace(params.field, settings);
};

/**
 * Detach a single or all editors.
 *
 * @todo 3.x: editor.prototype.getInstances() should always return an array
 *   containing all instances or the passed in params.field instance, but
 *   always return an array to simplify all detach functions.
 */
Drupal.wysiwyg.editor.detach.ckeditor = function (context, params, trigger) {
  var method = (trigger == 'serialize') ? 'updateElement' : 'destroy';
  if (typeof params != 'undefined') {
    var instance = CKEDITOR.instances[params.field];
    if (instance) {
      instance[method]();
    }
  }
  else {
    for (var instanceName in CKEDITOR.instances) {
      if (CKEDITOR.instances.hasOwnProperty(instanceName)) {
        CKEDITOR.instances[instanceName][method]();
      }
    }
  }
};

Drupal.wysiwyg.editor.instance.ckeditor = {
  addPlugin: function(pluginName, settings, pluginSettings) {
    CKEDITOR.plugins.add(pluginName, {
      // Wrap Drupal plugin in a proxy pluygin.
      init: function(editor) {
        if (settings.css) {
          editor.on('mode', function(ev) {
            if (ev.editor.mode == 'wysiwyg') {
              // Inject CSS files directly into the editing area head tag.
              $('head', $('#cke_contents_' + ev.editor.name + ' iframe').eq(0).contents()).append('<link rel="stylesheet" href="' + settings.css + '" type="text/css" >');
            }
          });
        }
        if (typeof Drupal.wysiwyg.plugins[pluginName].invoke == 'function') {
          var pluginCommand = {
            exec: function (editor) {
              var data = { format: 'html', node: null, content: '' };
              var selection = editor.getSelection();
              if (selection) {
                data.node = selection.getSelectedElement();
                if (data.node) {
                  data.node = data.node.$;
                }
                if (selection.getType() == CKEDITOR.SELECTION_TEXT) {
                  if (CKEDITOR.env.ie) {
                    data.content = selection.getNative().createRange().text;
                  }
                  else {
                    data.content = selection.getNative().toString();
                  }
                }
                else if (data.node) {
                  // content is supposed to contain the "outerHTML".
                  data.content = data.node.parentNode.innerHTML;
                }
              }
              Drupal.wysiwyg.plugins[pluginName].invoke(data, pluginSettings, editor.name);
            }
          };
          editor.addCommand(pluginName, pluginCommand);
        }
        editor.ui.addButton(pluginName, {
          label: settings.iconTitle,
          command: pluginName,
          icon: settings.icon
        });

        // @todo Add button state handling.
      }
    });
  },
  prepareContent: function(content) {
    // @todo Don't know if we need this yet.
    return content;
  },

  insert: function(content) {
    content = this.prepareContent(content);
    CKEDITOR.instances[this.field].insertHtml(content);
  },

  setContent: function (content) {
    CKEDITOR.instances[this.field].setData(content);
  },

  getContent: function () {
    return CKEDITOR.instances[this.field].getData();
  }
};

})(jQuery);
;
(function($) {

/**
 * Attach this editor to a target element.
 *
 * @param context
 *   A DOM element, supplied by Drupal.attachBehaviors().
 * @param params
 *   An object containing input format parameters. Default parameters are:
 *   - editor: The internal editor name.
 *   - theme: The name/key of the editor theme/profile to use.
 *   - field: The CSS id of the target element.
 * @param settings
 *   An object containing editor settings for all enabled editor themes.
 */
Drupal.wysiwyg.editor.attach.none = function(context, params, settings) {
  if (params.resizable) {
    var $wrapper = $('#' + params.field).parents('.form-textarea-wrapper:first');
    $wrapper.addClass('resizable');
    if (Drupal.behaviors.textarea) {
      Drupal.behaviors.textarea.attach();
    }
  }
};

/**
 * Detach a single or all editors.
 *
 * The editor syncs its contents back to the original field before its instance
 * is removed.
 *
 * @param context
 *   A DOM element, supplied by Drupal.attachBehaviors().
 * @param params
 *   (optional) An object containing input format parameters. If defined,
 *   only the editor instance in params.field should be detached. Otherwise,
 *   all editors should be detached and saved, so they can be submitted in
 *   AJAX/AHAH applications.
 * @param trigger
 *   A string describing why the editor is being detached.
 *   Possible triggers are:
 *   - unload: (default) Another or no editor is about to take its place.
 *   - move: Currently expected to produce the same result as unload.
 *   - serialize: The form is about to be serialized before an AJAX request or
 *     a normal form submission. If possible, perform a quick detach and leave
 *     the editor's GUI elements in place to avoid flashes or scrolling issues.
 * @see Drupal.detachBehaviors
 */
Drupal.wysiwyg.editor.detach.none = function (context, params, trigger) {
  if (typeof params != 'undefined' && (trigger != 'serialize')) {
    var $wrapper = $('#' + params.field).parents('.form-textarea-wrapper:first');
    $wrapper.removeOnce('textarea').removeClass('.resizable-textarea')
      .find('.grippie').remove();
  }
};

/**
 * Instance methods for plain text areas.
 */
Drupal.wysiwyg.editor.instance.none = {
  insert: function(content) {
    var editor = document.getElementById(this.field);

    // IE support.
    if (document.selection) {
      editor.focus();
      var sel = document.selection.createRange();
      sel.text = content;
    }
    // Mozilla/Firefox/Netscape 7+ support.
    else if (editor.selectionStart || editor.selectionStart == '0') {
      var startPos = editor.selectionStart;
      var endPos = editor.selectionEnd;
      editor.value = editor.value.substring(0, startPos) + content + editor.value.substring(endPos, editor.value.length);
    }
    // Fallback, just add to the end of the content.
    else {
      editor.value += content;
    }
  },

  setContent: function (content) {
    $('#' + this.field).val(content);
  },

  getContent: function () {
    return $('#' + this.field).val();
  }
};

})(jQuery);
;
// $Id
(function ($) {
/**
 * Wysiwyg plugin button implementation for syntaxhighlighter_insert plugin.
 */
Drupal.wysiwyg.plugins.syntaxhighlighter_insert_wysiwyg = {
  /**
   * Return whether the passed node belongs to this plugin.
   *
   * @param node
   *   The currently focused DOM element in the editor content.
   */
  isNode: function(node) {
    return ($(node).is('img.syntaxhighlighter_insert_wysiwyg-syntaxhighlighter_insert_wysiwyg'));
  },

  /**
   * Execute the button.
   *
   * @param data
   *   An object containing data about the current selection:
   *   - format: 'html' when the passed data is HTML content, 'text' when the
   *     passed data is plain-text content.
   *   - node: When 'format' is 'html', the focused DOM element in the editor.
   *   - content: The textual representation of the focused/selected editor
   *     content.
   * @param settings
   *   The plugin settings, as provided in the plugin's PHP include file.
   * @param instanceId
   *   The ID of the current editor instance.
   */
  invoke: function(data, settings, instanceId) {
    Drupal.wysiwyg.plugins.syntaxhighlighter_insert_wysiwyg.insert_form(data, settings, instanceId);
  },


  insert_form: function (data, settings, instanceId) {
    Drupal.syntaxhighlighterinsert.hideDescriptions();
    var form_id = Drupal.settings.syntaxhighlighter_insert_wysiwyg.current_form;

    // Location, where to fetch the dialog.
    var aurl = Drupal.settings.basePath + 'index.php?q=syntaxhighlighter_insert_wysiwyg/insert/' + form_id;
    var dialogdiv = jQuery('<div id="syntaxhighlighter-insert-dialog"></div>');
    dialogdiv.load(aurl + " #syntaxhighlighter-insert-wysiwyg-form", function(){
      var dialogClose = function () {
        try {
          dialogdiv.dialog('destroy').remove();
        } catch (e) {};
      };
      var btns = {};
      btns[Drupal.t('Insert syntaxhighlighter tag')] = function () {

        var editor_id = instanceId;
        var field_id = 'syntaxhighlighter-insert-wysiwyg-*field*-wysiwyg';

        var title = dialogdiv.contents().find('#' + field_id.replace('*field*', 'title')).val()
        var brush = dialogdiv.contents().find('#' + field_id.replace('*field*', 'brush')).val();
        var tag = dialogdiv.contents().find('#' + field_id.replace('*field*', 'tag')).val();
        var autolinks = dialogdiv.contents().find('#' + field_id.replace('*field*', 'auto-links')).is(':checked');
        var classname = dialogdiv.contents().find('#' + field_id.replace('*field*', 'class-name')).val();
        var collapse = dialogdiv.contents().find('#' + field_id.replace('*field*', 'collapse')).is(':checked');
        var firstline = dialogdiv.contents().find('#' + field_id.replace('*field*', 'first-line')).val();
        var highlight = dialogdiv.contents().find('#' + field_id.replace('*field*', 'highlight')).val();
        var htmlscript = dialogdiv.contents().find('#' + field_id.replace('*field*', 'html-script')).is(':checked');
        var smarttabs = dialogdiv.contents().find('#' + field_id.replace('*field*', 'smart-tabs')).is(':checked');
        var tabsize = dialogdiv.contents().find('#' + field_id.replace('*field*', 'tab-size')).val();
        var toolbar = dialogdiv.contents().find('#' + field_id.replace('*field*', 'toolbar')).is(':checked');
        var wrapper = dialogdiv.contents().find('#' + field_id.replace('*field*', 'form-wrapper'));
        var content = '<' + tag + ' class="';
        content += 'brush: ' + brush + '; ';
        content += 'auto-links: ' + new Boolean(autolinks).toString() + '; ';
        if (classname.length) content += "class-name: '" + classname + "'; ";
        content += 'collapse: ' + new Boolean(collapse).toString() + '; ';
        if (firstline.length) content += 'first-line: ' + firstline + '; ';
        if (highlight.length) content += 'highlight: ' + highlight + '; ';
        content += 'html-script: ' + new Boolean(htmlscript).toString() + '; ';
        content += 'smart-tabs: ' + new Boolean(smarttabs).toString() + '; ';
        if (tabsize.length) content += 'tab-size: ' + tabsize + '; ';
        content += 'toolbar: ' + new Boolean(toolbar).toString() + '; ';
        content += 'codetag" ';
        if (title.length) content += 'title="' + title + '" ';
        var message = Drupal.t('Type your code in the box. To create a new line within the box use SHIFT + ENTER.');
        content += ' id="shinsert-current-tag"> ' + message + ' </' + tag + '>';
        Drupal.wysiwyg.plugins.syntaxhighlighter_insert_wysiwyg.insertIntoEditor(content, editor_id);
        jQuery(this).dialog("close");
        Drupal.wysiwyg.plugins.syntaxhighlighter_insert_wysiwyg.selectTagContents(editor_id);


      };

      btns[Drupal.t('Cancel')] = function () {
        jQuery(this).dialog("close");
      };

      dialogdiv.dialog({
        modal: true,
        autoOpen: false,
        closeOnEscape: true,
        resizable: true,
        draggable: true,
        autoresize: true,
        namespace: 'jquery_ui_dialog_default_ns',
        dialogClass: 'jquery_ui_dialog-dialog',
        title: Drupal.t('Insert'),
        buttons: btns,
        width: '70%',
        close: dialogClose
      });
      dialogdiv.dialog("open");
      $('#syntaxhighlighter-insert-wysiwyg-form .description').hide();
    });
  },

  insertIntoEditor: function (syntaxhighlighter, editor_id) {
    Drupal.wysiwyg.instances[editor_id].insert(syntaxhighlighter);
  },
  selectTagContents: function(editor_id) {
    if (typeof Drupal.wysiwyg == 'undefined') {
      // nothing to do here.
      return;
    }
    var tag, rng
    switch (Drupal.wysiwyg.instances[editor_id].editor) {
      case 'tinymce':
        rng = tinyMCE.activeEditor.dom.createRng();
        tag = tinyMCE.activeEditor.dom.select('#shinsert-current-tag')[0];
        rng.selectNodeContents(tinyMCE.activeEditor.selection.select(tag));
        tinyMCE.activeEditor.selection.setRng(rng);
        // append an empty tag so you can get out of the syntaxhighlighter tags (editor specific)
        tinyMCE.activeEditor.dom.setOuterHTML('shinsert-current-tag', $(tag).removeAttr('id').clone().wrapAll("<div />").parent().html() + '<p></p>');
        break;
      case 'ckeditor':
        rng = new CKEDITOR.dom.range(CKEDITOR.currentInstance.document);
        tag = CKEDITOR.currentInstance.document.getById('shinsert-current-tag');
        rng.selectNodeContents(tag);
        CKEDITOR.currentInstance.getSelection().selectRanges([rng]);
        tag.removeAttribute('id');
        break;
    }
  },

  /**
   * Prepare all plain-text contents of this plugin with HTML representations.
   *
   * Optional; only required for "inline macro tag-processing" plugins.
   *
   * @param content
   *   The plain-text contents of a textarea.
   * @param settings
   *   The plugin settings, as provided in the plugin's PHP include file.
   * @param instanceId
   *   The ID of the current editor instance.
   */
  attach: function(content, settings, instanceId) {
    content = content.replace(/<!--syntaxhighlighter_insert_wysiwyg-->/g, this._getPlaceholder(settings));
    return content;
  },

  /**
   * Process all HTML placeholders of this plugin with plain-text contents.
   *
   * Optional; only required for "inline macro tag-processing" plugins.
   *
   * @param content
   *   The HTML content string of the editor.
   * @param settings
   *   The plugin settings, as provided in the plugin's PHP include file.
   * @param instanceId
   *   The ID of the current editor instance.
   */
  detach: function(content, settings, instanceId) {
    var $content = $('<div>' + content + '</div>');
    $.each($('img.syntaxhighlighter_insert_wysiwyg-syntaxhighlighter_insert_wysiwyg', $content), function (i, elem) {
      //...
      });
    return $content.html();
  },

  /**
   * Helper function to return a HTML placeholder.
   *
   * The 'drupal-content' CSS class is required for HTML elements in the editor
   * content that shall not trigger any editor's native buttons (such as the
   * image button for this example placeholder markup).
   */
  _getPlaceholder: function (settings) {
    return '<img src="' + settings.path + '/images/spacer.gif" alt="&lt;--syntaxhighlighter_insert_wysiwyg-&gt;" title="&lt;--syntaxhighlighter_insert_wysiwyg--&gt;" class="syntaxhighlighter_insert_wysiwyg-syntaxhighlighter_insert_wysiwyg drupal-content" />';
  }
};
})(jQuery);;
(function ($) {

// @todo Array syntax required; 'break' is a predefined token in JavaScript.
Drupal.wysiwyg.plugins['break'] = {

  /**
   * Return whether the passed node belongs to this plugin.
   */
  isNode: function(node) {
    return ($(node).is('img.wysiwyg-break'));
  },

  /**
   * Execute the button.
   */
  invoke: function(data, settings, instanceId) {
    if (data.format == 'html') {
      // Prevent duplicating a teaser break.
      if ($(data.node).is('img.wysiwyg-break')) {
        return;
      }
      var content = this._getPlaceholder(settings);
    }
    else {
      // Prevent duplicating a teaser break.
      // @todo data.content is the selection only; needs access to complete content.
      if (data.content.match(/<!--break-->/)) {
        return;
      }
      var content = '<!--break-->';
    }
    if (typeof content != 'undefined') {
      Drupal.wysiwyg.instances[instanceId].insert(content);
    }
  },

  /**
   * Replace all <!--break--> tags with images.
   */
  attach: function(content, settings, instanceId) {
    content = content.replace(/<!--break-->/g, this._getPlaceholder(settings));
    return content;
  },

  /**
   * Replace images with <!--break--> tags in content upon detaching editor.
   */
  detach: function(content, settings, instanceId) {
    var $content = $('<div>' + content + '</div>'); // No .outerHTML() in jQuery :(
    // #404532: document.createComment() required or IE will strip the comment.
    // #474908: IE 8 breaks when using jQuery methods to replace the elements.
    // @todo Add a generic implementation for all Drupal plugins for this.
    $.each($('img.wysiwyg-break', $content), function (i, elem) {
      elem.parentNode.insertBefore(document.createComment('break'), elem);
      elem.parentNode.removeChild(elem);
    });
    return $content.html();
  },

  /**
   * Helper function to return a HTML placeholder.
   */
  _getPlaceholder: function (settings) {
    return '<img src="' + settings.path + '/images/spacer.gif" alt="&lt;--break-&gt;" title="&lt;--break--&gt;" class="wysiwyg-break drupal-content" />';
  }
};

})(jQuery);
;

(function ($) {

/**
 * Auto-hide summary textarea if empty and show hide and unhide links.
 */
Drupal.behaviors.textSummary = {
  attach: function (context, settings) {
    $('.text-summary', context).once('text-summary', function () {
      var $widget = $(this).closest('div.field-type-text-with-summary');
      var $summaries = $widget.find('div.text-summary-wrapper');

      $summaries.once('text-summary-wrapper').each(function(index) {
        var $summary = $(this);
        var $summaryLabel = $summary.find('label').first();
        var $full = $widget.find('.text-full').eq(index).closest('.form-item');
        var $fullLabel = $full.find('label').first();

        // Create a placeholder label when the field cardinality is
        // unlimited or greater than 1.
        if ($fullLabel.length == 0) {
          $fullLabel = $('<label></label>').prependTo($full);
        }

        // Setup the edit/hide summary link.
        var $link = $('<span class="field-edit-link">(<a class="link-edit-summary" href="#">' + Drupal.t('Hide summary') + '</a>)</span>');
        var $a = $link.find('a');
        var toggleClick = true;
        $link.bind('click', function (e) {
          if (toggleClick) {
            $summary.hide();
            $a.html(Drupal.t('Edit summary'));
            $link.appendTo($fullLabel);
          }
          else {
            $summary.show();
            $a.html(Drupal.t('Hide summary'));
            $link.appendTo($summaryLabel);
          }
          toggleClick = !toggleClick;
          return false;
        }).appendTo($summaryLabel);

        // If no summary is set, hide the summary field.
        if ($(this).find('.text-summary').val() == '') {
          $link.click();
        }
      });
    });
  }
};

})(jQuery);
;
(function ($) {

Drupal.behaviors.textarea = {
  attach: function (context, settings) {
    $('.form-textarea-wrapper.resizable', context).once('textarea', function () {
      var staticOffset = null;
      var textarea = $(this).addClass('resizable-textarea').find('textarea');
      var grippie = $('<div class="grippie"></div>').mousedown(startDrag);

      grippie.insertAfter(textarea);

      function startDrag(e) {
        staticOffset = textarea.height() - e.pageY;
        textarea.css('opacity', 0.25);
        $(document).mousemove(performDrag).mouseup(endDrag);
        return false;
      }

      function performDrag(e) {
        textarea.height(Math.max(32, staticOffset + e.pageY) + 'px');
        return false;
      }

      function endDrag(e) {
        $(document).unbind('mousemove', performDrag).unbind('mouseup', endDrag);
        textarea.css('opacity', 1);
      }
    });
  }
};

})(jQuery);
;
(function ($) {

/**
 * Automatically display the guidelines of the selected text format.
 */
Drupal.behaviors.filterGuidelines = {
  attach: function (context) {
    $('.filter-guidelines', context).once('filter-guidelines')
      .find(':header').hide()
      .closest('.filter-wrapper').find('select.filter-list')
      .bind('change', function () {
        $(this).closest('.filter-wrapper')
          .find('.filter-guidelines-item').hide()
          .siblings('.filter-guidelines-' + this.value).show();
      })
      .change();
  }
};

})(jQuery);
;
(function ($) {

Drupal.behaviors.menuFieldsetSummaries = {
  attach: function (context) {
    $('fieldset.menu-link-form', context).drupalSetSummary(function (context) {
      if ($('.form-item-menu-enabled input', context).is(':checked')) {
        return Drupal.checkPlain($('.form-item-menu-link-title input', context).val());
      }
      else {
        return Drupal.t('Not in menu');
      }
    });
  }
};

/**
 * Automatically fill in a menu link title, if possible.
 */
Drupal.behaviors.menuLinkAutomaticTitle = {
  attach: function (context) {
    $('fieldset.menu-link-form', context).each(function () {
      // Try to find menu settings widget elements as well as a 'title' field in
      // the form, but play nicely with user permissions and form alterations.
      var $checkbox = $('.form-item-menu-enabled input', this);
      var $link_title = $('.form-item-menu-link-title input', context);
      var $title = $(this).closest('form').find('.form-item-title input');
      // Bail out if we do not have all required fields.
      if (!($checkbox.length && $link_title.length && $title.length)) {
        return;
      }
      // If there is a link title already, mark it as overridden. The user expects
      // that toggling the checkbox twice will take over the node's title.
      if ($checkbox.is(':checked') && $link_title.val().length) {
        $link_title.data('menuLinkAutomaticTitleOveridden', true);
      }
      // Whenever the value is changed manually, disable this behavior.
      $link_title.keyup(function () {
        $link_title.data('menuLinkAutomaticTitleOveridden', true);
      });
      // Global trigger on checkbox (do not fill-in a value when disabled).
      $checkbox.change(function () {
        if ($checkbox.is(':checked')) {
          if (!$link_title.data('menuLinkAutomaticTitleOveridden')) {
            $link_title.val($title.val());
          }
        }
        else {
          $link_title.val('');
          $link_title.removeData('menuLinkAutomaticTitleOveridden');
        }
        $checkbox.closest('fieldset.vertical-tabs-pane').trigger('summaryUpdated');
        $checkbox.trigger('formUpdated');
      });
      // Take over any title change.
      $title.keyup(function () {
        if (!$link_title.data('menuLinkAutomaticTitleOveridden') && $checkbox.is(':checked')) {
          $link_title.val($title.val());
          $link_title.val($title.val()).trigger('formUpdated');
        }
      });
    });
  }
};

})(jQuery);
;
(function ($) {

Drupal.behaviors.pathFieldsetSummaries = {
  attach: function (context) {
    $('fieldset.path-form', context).drupalSetSummary(function (context) {
      var path = $('.form-item-path-alias input').val();
      var automatic = $('.form-item-path-pathauto input').attr('checked');

      if (automatic) {
        return Drupal.t('Automatic alias');
      }
      if (path) {
        return Drupal.t('Alias: @alias', { '@alias': path });
      }
      else {
        return Drupal.t('No alias');
      }
    });
  }
};

})(jQuery);
;

(function ($) {

Drupal.behaviors.commentFieldsetSummaries = {
  attach: function (context) {
    $('.comment-node-settings-form', context).drupalSetSummary(function (context) {
      return Drupal.checkPlain($('.form-item-comment input:checked', context).closest('label').text());
    });

    // Provide the summary for the node type form.
    $('.comment-node-type-settings-form', context).drupalSetSummary(function(context) {
      var vals = [];

      // Default comment setting.
      vals.push($(".form-item-comment select option:selected", context).text());

      // Threading.
      var threading = $(".form-item-comment-default-mode input:checked", context).closest('label').text();
      if (threading) {
        vals.push(threading);
      }

      // Comments per page.
      var number = $(".form-item-comment-default-per-page select option:selected", context).val();
      vals.push(Drupal.t('@number comments per page', {'@number': number}));

      return Drupal.checkPlain(vals.join(', '));
    });
  }
};

})(jQuery);
;
(function ($) {

/**
 * Attaches the autocomplete behavior to all required fields.
 */
Drupal.behaviors.autocomplete = {
  attach: function (context, settings) {
    var acdb = [];
    $('input.autocomplete', context).once('autocomplete', function () {
      var uri = this.value;
      if (!acdb[uri]) {
        acdb[uri] = new Drupal.ACDB(uri);
      }
      var $input = $('#' + this.id.substr(0, this.id.length - 13))
        .attr('autocomplete', 'OFF')
        .attr('aria-autocomplete', 'list');
      $($input[0].form).submit(Drupal.autocompleteSubmit);
      $input.parent()
        .attr('role', 'application')
        .append($('<span class="element-invisible" aria-live="assertive"></span>')
          .attr('id', $input.attr('id') + '-autocomplete-aria-live')
        );
      new Drupal.jsAC($input, acdb[uri]);
    });
  }
};

/**
 * Prevents the form from submitting if the suggestions popup is open
 * and closes the suggestions popup when doing so.
 */
Drupal.autocompleteSubmit = function () {
  return $('#autocomplete').each(function () {
    this.owner.hidePopup();
  }).length == 0;
};

/**
 * An AutoComplete object.
 */
Drupal.jsAC = function ($input, db) {
  var ac = this;
  this.input = $input[0];
  this.ariaLive = $('#' + this.input.id + '-autocomplete-aria-live');
  this.db = db;

  $input
    .keydown(function (event) { return ac.onkeydown(this, event); })
    .keyup(function (event) { ac.onkeyup(this, event); })
    .blur(function () { ac.hidePopup(); ac.db.cancel(); });

};

/**
 * Handler for the "keydown" event.
 */
Drupal.jsAC.prototype.onkeydown = function (input, e) {
  if (!e) {
    e = window.event;
  }
  switch (e.keyCode) {
    case 40: // down arrow.
      this.selectDown();
      return false;
    case 38: // up arrow.
      this.selectUp();
      return false;
    default: // All other keys.
      return true;
  }
};

/**
 * Handler for the "keyup" event.
 */
Drupal.jsAC.prototype.onkeyup = function (input, e) {
  if (!e) {
    e = window.event;
  }
  switch (e.keyCode) {
    case 16: // Shift.
    case 17: // Ctrl.
    case 18: // Alt.
    case 20: // Caps lock.
    case 33: // Page up.
    case 34: // Page down.
    case 35: // End.
    case 36: // Home.
    case 37: // Left arrow.
    case 38: // Up arrow.
    case 39: // Right arrow.
    case 40: // Down arrow.
      return true;

    case 9:  // Tab.
    case 13: // Enter.
    case 27: // Esc.
      this.hidePopup(e.keyCode);
      return true;

    default: // All other keys.
      if (input.value.length > 0 && !input.readOnly) {
        this.populatePopup();
      }
      else {
        this.hidePopup(e.keyCode);
      }
      return true;
  }
};

/**
 * Puts the currently highlighted suggestion into the autocomplete field.
 */
Drupal.jsAC.prototype.select = function (node) {
  this.input.value = $(node).data('autocompleteValue');
  $(this.input).trigger('autocompleteSelect', [node]);
};

/**
 * Highlights the next suggestion.
 */
Drupal.jsAC.prototype.selectDown = function () {
  if (this.selected && this.selected.nextSibling) {
    this.highlight(this.selected.nextSibling);
  }
  else if (this.popup) {
    var lis = $('li', this.popup);
    if (lis.length > 0) {
      this.highlight(lis.get(0));
    }
  }
};

/**
 * Highlights the previous suggestion.
 */
Drupal.jsAC.prototype.selectUp = function () {
  if (this.selected && this.selected.previousSibling) {
    this.highlight(this.selected.previousSibling);
  }
};

/**
 * Highlights a suggestion.
 */
Drupal.jsAC.prototype.highlight = function (node) {
  if (this.selected) {
    $(this.selected).removeClass('selected');
  }
  $(node).addClass('selected');
  this.selected = node;
  $(this.ariaLive).html($(this.selected).html());
};

/**
 * Unhighlights a suggestion.
 */
Drupal.jsAC.prototype.unhighlight = function (node) {
  $(node).removeClass('selected');
  this.selected = false;
  $(this.ariaLive).empty();
};

/**
 * Hides the autocomplete suggestions.
 */
Drupal.jsAC.prototype.hidePopup = function (keycode) {
  // Select item if the right key or mousebutton was pressed.
  if (this.selected && ((keycode && keycode != 46 && keycode != 8 && keycode != 27) || !keycode)) {
    this.select(this.selected);
  }
  // Hide popup.
  var popup = this.popup;
  if (popup) {
    this.popup = null;
    $(popup).fadeOut('fast', function () { $(popup).remove(); });
  }
  this.selected = false;
  $(this.ariaLive).empty();
};

/**
 * Positions the suggestions popup and starts a search.
 */
Drupal.jsAC.prototype.populatePopup = function () {
  var $input = $(this.input);
  var position = $input.position();
  // Show popup.
  if (this.popup) {
    $(this.popup).remove();
  }
  this.selected = false;
  this.popup = $('<div id="autocomplete"></div>')[0];
  this.popup.owner = this;
  $(this.popup).css({
    top: parseInt(position.top + this.input.offsetHeight, 10) + 'px',
    left: parseInt(position.left, 10) + 'px',
    width: $input.innerWidth() + 'px',
    display: 'none'
  });
  $input.before(this.popup);

  // Do search.
  this.db.owner = this;
  this.db.search(this.input.value);
};

/**
 * Fills the suggestion popup with any matches received.
 */
Drupal.jsAC.prototype.found = function (matches) {
  // If no value in the textfield, do not show the popup.
  if (!this.input.value.length) {
    return false;
  }

  // Prepare matches.
  var ul = $('<ul></ul>');
  var ac = this;
  for (key in matches) {
    $('<li></li>')
      .html($('<div></div>').html(matches[key]))
      .mousedown(function () { ac.hidePopup(this); })
      .mouseover(function () { ac.highlight(this); })
      .mouseout(function () { ac.unhighlight(this); })
      .data('autocompleteValue', key)
      .appendTo(ul);
  }

  // Show popup with matches, if any.
  if (this.popup) {
    if (ul.children().length) {
      $(this.popup).empty().append(ul).show();
      $(this.ariaLive).html(Drupal.t('Autocomplete popup'));
    }
    else {
      $(this.popup).css({ visibility: 'hidden' });
      this.hidePopup();
    }
  }
};

Drupal.jsAC.prototype.setStatus = function (status) {
  switch (status) {
    case 'begin':
      $(this.input).addClass('throbbing');
      $(this.ariaLive).html(Drupal.t('Searching for matches...'));
      break;
    case 'cancel':
    case 'error':
    case 'found':
      $(this.input).removeClass('throbbing');
      break;
  }
};

/**
 * An AutoComplete DataBase object.
 */
Drupal.ACDB = function (uri) {
  this.uri = uri;
  this.delay = 300;
  this.cache = {};
};

/**
 * Performs a cached and delayed search.
 */
Drupal.ACDB.prototype.search = function (searchString) {
  var db = this;
  this.searchString = searchString;

  // See if this string needs to be searched for anyway.
  searchString = searchString.replace(/^\s+|\s+$/, '');
  if (searchString.length <= 0 ||
    searchString.charAt(searchString.length - 1) == ',') {
    return;
  }

  // See if this key has been searched for before.
  if (this.cache[searchString]) {
    return this.owner.found(this.cache[searchString]);
  }

  // Initiate delayed search.
  if (this.timer) {
    clearTimeout(this.timer);
  }
  this.timer = setTimeout(function () {
    db.owner.setStatus('begin');

    // Ajax GET request for autocompletion. We use Drupal.encodePath instead of
    // encodeURIComponent to allow autocomplete search terms to contain slashes.
    $.ajax({
      type: 'GET',
      url: db.uri + '/' + Drupal.encodePath(searchString),
      dataType: 'json',
      success: function (matches) {
        if (typeof matches.status == 'undefined' || matches.status != 0) {
          db.cache[searchString] = matches;
          // Verify if these are still the matches the user wants to see.
          if (db.searchString == searchString) {
            db.owner.found(matches);
          }
          db.owner.setStatus('found');
        }
      },
      error: function (xmlhttp) {
        alert(Drupal.ajaxError(xmlhttp, db.uri));
      }
    });
  }, this.delay);
};

/**
 * Cancels the current autocomplete request.
 */
Drupal.ACDB.prototype.cancel = function () {
  if (this.owner) this.owner.setStatus('cancel');
  if (this.timer) clearTimeout(this.timer);
  this.searchString = '';
};

})(jQuery);
;

(function ($) {

Drupal.behaviors.nodeFieldsetSummaries = {
  attach: function (context) {
    $('fieldset.node-form-revision-information', context).drupalSetSummary(function (context) {
      var revisionCheckbox = $('.form-item-revision input', context);

      // Return 'New revision' if the 'Create new revision' checkbox is checked,
      // or if the checkbox doesn't exist, but the revision log does. For users
      // without the "Administer content" permission the checkbox won't appear,
      // but the revision log will if the content type is set to auto-revision.
      if (revisionCheckbox.is(':checked') || (!revisionCheckbox.length && $('.form-item-log textarea', context).length)) {
        return Drupal.t('New revision');
      }

      return Drupal.t('No revision');
    });

    $('fieldset.node-form-author', context).drupalSetSummary(function (context) {
      var name = $('.form-item-name input', context).val() || Drupal.settings.anonymous,
        date = $('.form-item-date input', context).val();
      return date ?
        Drupal.t('By @name on @date', { '@name': name, '@date': date }) :
        Drupal.t('By @name', { '@name': name });
    });

    $('fieldset.node-form-options', context).drupalSetSummary(function (context) {
      var vals = [];

      $('input:checked', context).parent().each(function () {
        vals.push(Drupal.checkPlain($.trim($(this).text())));
      });

      if (!$('.form-item-status input', context).is(':checked')) {
        vals.unshift(Drupal.t('Not published'));
      }
      return vals.join(', ');
    });
  }
};

})(jQuery);
;
!function(){var t;Function&&Function.prototype&&Function.prototype.bind&&(/MSIE [678]/.test(navigator.userAgent)||!function e(t,n,i){function r(s,a){if(!n[s]){if(!t[s]){var c="function"==typeof require&&require;if(!a&&c)return c(s,!0);if(o)return o(s,!0);var u=new Error("Cannot find module '"+s+"'");throw u.code="MODULE_NOT_FOUND",u}var l=n[s]={exports:{}};t[s][0].call(l.exports,function(e){var n=t[s][1][e];return r(n?n:e)},l,l.exports,e,t,n,i)}return n[s].exports}for(var o="function"==typeof require&&require,s=0;s<i.length;s++)r(i[s]);return r}({1:[function(e,n,i){(function(){"use strict";function e(t){return"function"==typeof t||"object"==typeof t&&null!==t}function i(t){return"function"==typeof t}function r(t){return"object"==typeof t&&null!==t}function o(){}function s(){return function(){process.nextTick(l)}}function a(){var t=0,e=new U(l),n=document.createTextNode("");return e.observe(n,{characterData:!0}),function(){n.data=t=++t%2}}function c(){var t=new MessageChannel;return t.port1.onmessage=l,function(){t.port2.postMessage(0)}}function u(){return function(){setTimeout(l,1)}}function l(){for(var t=0;M>t;t+=2){var e=q[t],n=q[t+1];e(n),q[t]=void 0,q[t+1]=void 0}M=0}function d(){}function h(){return new TypeError("You cannot resolve a promise with itself")}function f(){return new TypeError("A promises callback cannot return that same promise.")}function p(t){try{return t.then}catch(e){return V.error=e,V}}function m(t,e,n,i){try{t.call(e,n,i)}catch(r){return r}}function g(t,e,n){H(function(t){var i=!1,r=m(n,e,function(n){i||(i=!0,e!==n?w(t,n):_(t,n))},function(e){i||(i=!0,E(t,e))},"Settle: "+(t._label||" unknown promise"));!i&&r&&(i=!0,E(t,r))},t)}function v(t,e){e._state===z?_(t,e._result):t._state===B?E(t,e._result):A(e,void 0,function(e){w(t,e)},function(e){E(t,e)})}function y(t,e){if(e.constructor===t.constructor)v(t,e);else{var n=p(e);n===V?E(t,V.error):void 0===n?_(t,e):i(n)?g(t,e,n):_(t,e)}}function w(t,n){t===n?E(t,h()):e(n)?y(t,n):_(t,n)}function b(t){t._onerror&&t._onerror(t._result),T(t)}function _(t,e){t._state===F&&(t._result=e,t._state=z,0===t._subscribers.length||H(T,t))}function E(t,e){t._state===F&&(t._state=B,t._result=e,H(b,t))}function A(t,e,n,i){var r=t._subscribers,o=r.length;t._onerror=null,r[o]=e,r[o+z]=n,r[o+B]=i,0===o&&t._state&&H(T,t)}function T(t){var e=t._subscribers,n=t._state;if(0!==e.length){for(var i,r,o=t._result,s=0;s<e.length;s+=3)i=e[s],r=e[s+n],i?S(n,i,r,o):r(o);t._subscribers.length=0}}function x(){this.error=null}function I(t,e){try{return t(e)}catch(n){return G.error=n,G}}function S(t,e,n,r){var o,s,a,c,u=i(n);if(u){if(o=I(n,r),o===G?(c=!0,s=o.error,o=null):a=!0,e===o)return void E(e,f())}else o=r,a=!0;e._state!==F||(u&&a?w(e,o):c?E(e,s):t===z?_(e,o):t===B&&E(e,o))}function D(t,e){try{e(function(e){w(t,e)},function(e){E(t,e)})}catch(n){E(t,n)}}function N(t,e,n,i){this._instanceConstructor=t,this.promise=new t(d,i),this._abortOnReject=n,this._validateInput(e)?(this._input=e,this.length=e.length,this._remaining=e.length,this._init(),0===this.length?_(this.promise,this._result):(this.length=this.length||0,this._enumerate(),0===this._remaining&&_(this.promise,this._result))):E(this.promise,this._validationError())}function C(){throw new TypeError("You must pass a resolver function as the first argument to the promise constructor")}function P(){throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.")}function R(t){this._id=X++,this._state=void 0,this._result=void 0,this._subscribers=[],d!==t&&(i(t)||C(),this instanceof R||P(),D(this,t))}var L;L=Array.isArray?Array.isArray:function(t){return"[object Array]"===Object.prototype.toString.call(t)};var k,O=L,M=(Date.now||function(){return(new Date).getTime()},Object.create||function(t){if(arguments.length>1)throw new Error("Second argument not supported");if("object"!=typeof t)throw new TypeError("Argument must be an object");return o.prototype=t,new o},0),H=function(t,e){q[M]=t,q[M+1]=e,M+=2,2===M&&k()},W="undefined"!=typeof window?window:{},U=W.MutationObserver||W.WebKitMutationObserver,j="undefined"!=typeof Uint8ClampedArray&&"undefined"!=typeof importScripts&&"undefined"!=typeof MessageChannel,q=new Array(1e3);k="undefined"!=typeof process&&"[object process]"==={}.toString.call(process)?s():U?a():j?c():u();var F=void 0,z=1,B=2,V=new x,G=new x;N.prototype._validateInput=function(t){return O(t)},N.prototype._validationError=function(){return new Error("Array Methods must be provided an Array")},N.prototype._init=function(){this._result=new Array(this.length)};var $=N;N.prototype._enumerate=function(){for(var t=this.length,e=this.promise,n=this._input,i=0;e._state===F&&t>i;i++)this._eachEntry(n[i],i)},N.prototype._eachEntry=function(t,e){var n=this._instanceConstructor;r(t)?t.constructor===n&&t._state!==F?(t._onerror=null,this._settledAt(t._state,e,t._result)):this._willSettleAt(n.resolve(t),e):(this._remaining--,this._result[e]=this._makeResult(z,e,t))},N.prototype._settledAt=function(t,e,n){var i=this.promise;i._state===F&&(this._remaining--,this._abortOnReject&&t===B?E(i,n):this._result[e]=this._makeResult(t,e,n)),0===this._remaining&&_(i,this._result)},N.prototype._makeResult=function(t,e,n){return n},N.prototype._willSettleAt=function(t,e){var n=this;A(t,void 0,function(t){n._settledAt(z,e,t)},function(t){n._settledAt(B,e,t)})};var J=function(t,e){return new $(this,t,!0,e).promise},K=function(t,e){function n(t){w(o,t)}function i(t){E(o,t)}var r=this,o=new r(d,e);if(!O(t))return E(o,new TypeError("You must pass an array to race.")),o;for(var s=t.length,a=0;o._state===F&&s>a;a++)A(r.resolve(t[a]),void 0,n,i);return o},Y=function(t,e){var n=this;if(t&&"object"==typeof t&&t.constructor===n)return t;var i=new n(d,e);return w(i,t),i},Q=function(t,e){var n=this,i=new n(d,e);return E(i,t),i},X=0,Z=R;R.all=J,R.race=K,R.resolve=Y,R.reject=Q,R.prototype={constructor:R,then:function(t,e){var n=this,i=n._state;if(i===z&&!t||i===B&&!e)return this;var r=new this.constructor(d),o=n._result;if(i){var s=arguments[i-1];H(function(){S(i,r,s,o)})}else A(n,r,t,e);return r},"catch":function(t){return this.then(null,t)}};var tt=function(){var t;t="undefined"!=typeof global?global:"undefined"!=typeof window&&window.document?window:self;var e="Promise"in t&&"resolve"in t.Promise&&"reject"in t.Promise&&"all"in t.Promise&&"race"in t.Promise&&function(){var e;return new t.Promise(function(t){e=t}),i(e)}();e||(t.Promise=Z)},et={Promise:Z,polyfill:tt};"function"==typeof t&&t.amd?t(function(){return et}):"undefined"!=typeof n&&n.exports?n.exports=et:"undefined"!=typeof this&&(this.ES6Promise=et)}).call(this)},{}],2:[function(t,e,n){function i(t,e){var n;return e=e||s,(n=e.requestAnimationFrame||e.webkitRequestAnimationFrame||e.mozRequestAnimationFrame||e.msRequestAnimationFrame||e.oRequestAnimationFrame||function(){e.setTimeout(function(){t(+new Date)},1e3/60)})(t)}function r(t,e){return Math.sin(Math.PI/2*e)*t}function o(t,e,n,r,o){function s(){var c=+new Date,u=c-a,l=Math.min(u/n,1),d=r?r(e,l):e*l,h=1==l;t(d,h),h||i(s,o)}var a=+new Date;i(s)}var s=t(16);e.exports={animate:o,requestAnimationFrame:i,easeOut:r}},{16:16}],3:[function(t,e,n){function i(){return a.builtUrl(u)}function r(t){return"dark"===t?"dark":"light"}function o(t,e,n){var i,o;return n=r(n),i=s.isRtlLang(e)?"rtl":"ltr",o=[t,c.css,n,i,"css"].join("."),a.base()+"/css/"+o}var s=t(23),a=t(43),c=t(82),u="embed/timeline.css";e.exports={tweet:o.bind(null,"tweet"),timeline:i,video:o.bind(null,"video")}},{23:23,43:43,82:82}],4:[function(t,e,n){function i(t){return{success:!0,resp:t}}e.exports=i},{}],5:[function(t,e,n){function i(){return l+d++}function r(t,e,n,r){var l,d,h;return r=r||i(),l=s.fullPath(["callbacks",r]),d=o.createElement("script"),h=new a,e=c.aug({},e,{callback:l,suppress_response_codes:!0}),s.set(["callbacks",r],function(t){var e,i;e=n(t||!1),t=e.resp,i=e.success,i?h.resolve(t):h.reject(t),d.onload=d.onreadystatechange=null,d.parentNode&&d.parentNode.removeChild(d),s.unset(["callbacks",r])}),d.onerror=function(){h.reject(new Error("failed to fetch "+d.src))},d.src=u.url(t,e),d.async="async",o.body.appendChild(d),h.promise}var o=t(13),s=t(20),a=t(70),c=t(79),u=t(73),l="cb",d=0;e.exports={fetch:r}},{13:13,20:20,70:70,73:73,79:79}],6:[function(t,e,n){function i(t){var e,n;return e=t.headers&&t.headers.status,n=t&&!t.error&&200===e,!n&&t.headers&&t.headers.message&&r.warn(t.headers.message),{success:n,resp:t}}var r=t(67);e.exports=i},{67:67}],7:[function(t,e,n){function i(t){return 10>t?"0"+t:t}function r(t){function e(t,e){return n&&n[t]&&(t=n[t]),t.replace(/%\{([\w_]+)\}/g,function(t,n){return void 0!==e[n]?e[n]:t})}var n=t&&t.phrases,o=t&&t.months||c,s=t&&t.formats||u;this.timeAgo=function(t){var n,i=r.parseDate(t),a=+new Date,c=a-i;return i?isNaN(c)||2*l>c?e("now"):d>c?(n=Math.floor(c/l),e(s.abbr,{number:n,symbol:e(p,{abbr:e("s"),expanded:e(n>1?"seconds":"second")})})):h>c?(n=Math.floor(c/d),e(s.abbr,{number:n,symbol:e(p,{abbr:e("m"),expanded:e(n>1?"minutes":"minute")})})):f>c?(n=Math.floor(c/h),e(s.abbr,{number:n,symbol:e(p,{abbr:e("h"),expanded:e(n>1?"hours":"hour")})})):365*f>c?e(s.shortdate,{day:i.getDate(),month:e(o[i.getMonth()])}):e(s.longdate,{day:i.getDate(),month:e(o[i.getMonth()]),year:i.getFullYear().toString().slice(2)}):""},this.localTimeStamp=function(t){var n=r.parseDate(t),a=n&&n.getHours();return n?e(s.full,{day:n.getDate(),month:e(o[n.getMonth()]),year:n.getFullYear(),hours24:i(a),hours12:13>a?a?a:"12":a-12,minutes:i(n.getMinutes()),seconds:i(n.getSeconds()),amPm:e(12>a?"AM":"PM")}):""}}var o=/(\d{4})-?(\d{2})-?(\d{2})T(\d{2}):?(\d{2}):?(\d{2})(Z|[\+\-]\d{2}:?\d{2})/,s=/[a-z]{3,4} ([a-z]{3}) (\d{1,2}) (\d{1,2}):(\d{2}):(\d{2}) ([\+\-]\d{2}:?\d{2}) (\d{4})/i,a=/^\d+$/,c=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],u={abbr:"%{number}%{symbol}",shortdate:"%{day} %{month}",longdate:"%{day} %{month} %{year}",full:"%{hours12}:%{minutes} %{amPm} - %{day} %{month} %{year}"},l=1e3,d=60*l,h=60*d,f=24*h,p='<abbr title="%{expanded}">%{abbr}</abbr>';r.parseDate=function(t){var e,n,i=t||"",r=i.toString();return(e=function(){var t;return a.test(r)?parseInt(r,10):(t=r.match(s))?Date.UTC(t[7],c.indexOf(t[1]),t[2],t[3],t[4],t[5]):(t=r.match(o))?Date.UTC(t[1],t[2]-1,t[3],t[4],t[5],t[6]):void 0}())?(n=new Date(e),!isNaN(n.getTime())&&n):!1},e.exports=r},{}],8:[function(t,e,n){function i(t){return new RegExp("\\b"+t+"\\b","g")}function r(t,e){return t.classList?void t.classList.add(e):void(i(e).test(t.className)||(t.className+=" "+e))}function o(t,e){return t.classList?void t.classList.remove(e):void(t.className=t.className.replace(i(e)," "))}function s(t,e,n){return void 0===n&&t.classList&&t.classList.toggle?t.classList.toggle(e,n):(n?r(t,e):o(t,e),n)}function a(t,e,n){return t.classList&&c(t,e)?(o(t,e),void r(t,n)):void(t.className=t.className.replace(i(e),n))}function c(t,e){return t.classList?t.classList.contains(e):i(e).test(t.className)}e.exports={add:r,remove:o,replace:a,toggle:s,present:c}},{}],9:[function(t,e,n){function i(t){var e=t.getAttribute("data-twitter-event-id");return e?e:(t.setAttribute("data-twitter-event-id",++m),m)}function r(t,e,n){var i=0,r=t&&t.length||0;for(i=0;r>i;i++)t[i].call(e,n,e)}function o(t,e,n){for(var i=n||t.target||t.srcElement,s=i.className.split(" "),a=0,c=s.length;c>a;a++)r(e["."+s[a]],i,t);r(e[i.tagName],i,t),t.cease||i!==this&&o.call(this,t,e,i.parentElement||i.parentNode)}function s(t,e,n,i){function r(i){o.call(t,i,n[e])}a(t,r,e,i),t.addEventListener(e,r,!1)}function a(t,e,n,i){t.id&&(g[t.id]=g[t.id]||[],g[t.id].push({el:t,listener:e,type:n,rootId:i}))}function c(t){var e=g[t];e&&(e.forEach(function(t){t.el.removeEventListener(t.type,t.listener,!1),delete p[t.rootId]}),delete g[t])}function u(t,e,n,r){var o=i(t);p[o]=p[o]||{},p[o][e]||(p[o][e]={},s(t,e,p[o],o)),p[o][e][n]=p[o][e][n]||[],p[o][e][n].push(r)}function l(t,e,n){var r=i(e),s=p[r]&&p[r];o.call(e,{target:n},s[t])}function d(t){return f(t),h(t),!1}function h(t){t&&t.preventDefault?t.preventDefault():t.returnValue=!1}function f(t){t&&(t.cease=!0)&&t.stopPropagation?t.stopPropagation():t.cancelBubble=!0}var p={},m=-1,g={};e.exports={stop:d,stopPropagation:f,preventDefault:h,delegate:u,simulate:l,removeDelegatesForWidget:c}},{}],10:[function(t,e,n){function i(t){var e=t.charAt(0);return"."===e?function(e){var n=e.className?e.className.split(/\s+/):[];return o.contains(n,t.slice(1))}:"#"===e?function(e){return e.id===t.slice(1)}:function(e){return e.tagName===t.toUpperCase()}}function r(t,e,n){var s;if(e)return n=n||e&&e.ownerDocument,s=o.isType("function",t)?t:i(t),e===n?s(e)?e:void 0:s(e)?e:r(s,e.parentNode,n)}var o=t(79);e.exports={closest:r}},{79:79}],11:[function(t,e,n){function i(t){return t=t||o,t.getSelection&&t.getSelection()}function r(t){var e=i(t);return e?e.toString():""}var o=t(16);e.exports={getSelection:i,getSelectedText:r}},{16:16}],12:[function(t,e,n){function i(t){return t&&1===t.nodeType?t.offsetWidth||i(t.parentNode):0}e.exports={effectiveWidth:i}},{}],13:[function(t,e,n){e.exports=document},{}],14:[function(t,e,n){e.exports=location},{}],15:[function(t,e,n){e.exports=navigator},{}],16:[function(t,e,n){e.exports=window},{}],17:[function(t,e,n){function i(t,e,n){e.ready=t.then.bind(t),n&&Array.isArray(e[n])&&(e[n].forEach(t.then.bind(t)),delete e[n])}e.exports={exposeReadyPromise:i}},{}],18:[function(t,e,n){function i(t){return a.isType("string",t)?t.split("."):a.isType("array",t)?t:[]}function r(t,e){var n=i(e),r=n.slice(0,-1);return r.reduce(function(t,e,n){if(t[e]=t[e]||{},!a.isObject(t[e]))throw new Error(r.slice(0,n+1).join(".")+" is already defined with a value.");return t[e]},t)}function o(t,e){e=e||s,e[t]=e[t]||{},Object.defineProperty(this,"base",{value:e[t]}),Object.defineProperty(this,"name",{value:t})}var s=t(16),a=t(79);a.aug(o.prototype,{get:function(t){var e=i(t);return e.reduce(function(t,e){return a.isObject(t)?t[e]:void 0},this.base)},set:function(t,e,n){var o=i(t),s=r(this.base,t),a=o.slice(-1);return n&&a in s?s[a]:s[a]=e},init:function(t,e){return this.set(t,e,!0)},unset:function(t){var e=i(t),n=this.get(e.slice(0,-1));n&&delete n[e.slice(-1)]},aug:function(t){var e=this.get(t),n=a.toRealArray(arguments).slice(1);if(e="undefined"!=typeof e?e:{},n.unshift(e),!n.every(a.isObject))throw new Error("Cannot augment non-object.");return this.set(t,a.aug.apply(null,n))},call:function(t){var e=this.get(t),n=a.toRealArray(arguments).slice(1);if(!a.isType("function",e))throw new Error("Function "+t+"does not exist.");return e.apply(null,n)},fullPath:function(t){var e=i(t);return e.unshift(this.name),e.join(".")}}),e.exports=o},{16:16,79:79}],19:[function(t,e,n){function i(t){var e,n,i,r=0;for(o={},t=t||s,e=t.getElementsByTagName("meta");n=e[r];r++)/^twitter:/.test(n.name)&&(i=n.name.replace(/^twitter:/,""),o[i]=n.content)}function r(t){return o[t]}var o,s=t(13);i(),e.exports={init:i,val:r}},{13:13}],20:[function(t,e,n){var i=t(18);e.exports=new i("__twttr")},{18:18}],21:[function(t,e,n){var i=t(18);e.exports=new i("twttr")},{18:18}],22:[function(t,e,n){e.exports=["hi","zh-cn","fr","zh-tw","msa","fil","fi","sv","pl","ja","ko","de","it","pt","es","ru","id","tr","da","no","nl","hu","fa","ar","ur","he","th","cs","uk","vi","ro","bn"]},{}],23:[function(t,e,n){function i(t){return t=String(t).toLowerCase(),r.contains(o,t)}var r=t(79),o=["ar","fa","he","ur"];e.exports={isRtlLang:i}},{79:79}],24:[function(t,e,n){function i(t){var e=~s.host.indexOf("poptip.com")?"https://poptip.com":s.href,n="original_referer="+e;return[t,n].join(-1==t.indexOf("?")?"?":"&")}function r(t){var e,n;t.altKey||t.metaKey||t.shiftKey||(e=c.closest(function(t){return"A"===t.tagName||"AREA"===t.tagName},t.target),e&&l.isIntentURL(e.href)&&(n=i(e.href),n=n.replace(/^http[:]/,"https:"),n=n.replace(/^\/\//,"https://"),u.open(n,e),a.preventDefault(t)))}function o(t){t.addEventListener("click",r,!1)}var s=t(14),a=t(9),c=t(10),u=t(52),l=t(75);e.exports={attachTo:o}},{10:10,14:14,52:52,75:75,9:9}],25:[function(t,e,n){function i(t){var e=[];return h.forIn(t,function(t,n){e.push(t+"="+n)}),e.join(",")}function r(){return f+d.generate()}function o(t,e){function n(t){return Math.round(t/2)}return t>e?{coordinate:0,size:e}:{coordinate:n(e)-n(t),size:t}}function s(t,e,n){var r,s;e=a.parse(e),n=n||{},r=o(e.width,n.width||p),e.left=r.coordinate,e.width=r.size,s=o(e.height,n.height||m),e.top=s.coordinate,e.height=s.size,this.win=t,this.features=i(e)}var a,c=t(16),u=t(68),l=t(75),d=t(77),h=t(79),f="intent_",p=c.screen.width,m=c.screen.height;a=(new u).defaults({width:550,height:520,personalbar:"0",toolbar:"0",location:"1",scrollbars:"1",resizable:"1"}),s.prototype.open=function(t){return l.isTwitterURL(t)?(this.name=r(),this.popup=this.win.open(t,this.name,this.features),this):void 0},s.open=function(t,e){var n=new s(c,e);return n.open(t)},e.exports=s},{16:16,68:68,75:75,77:77,79:79}],26:[function(t,e,n){function i(t){u[t]=+new Date}function r(t){return u[t]?+new Date-u[t]:null}function o(t,e,n,i,o){var a=r(e);a&&s(t,n,i,a,o)}function s(t,e,n,i,r){var o,s=void 0===r?l:r;100*Math.random()>s||(n=c.aug(n||{},{duration_ms:i}),o={page:e,component:"performance",action:t},a.clientEvent(o,n,!0))}var a=t(38),c=t(79),u={},l=1;e.exports={start:i,end:r,track:s,endAndTrack:o}},{38:38,79:79}],27:[function(t,e,n){function i(t){if(!t)throw new Error("JsonRpcClient requires a dispatcher");this.idIterator=0,this.dispatcher=t,this.idPrefix=String(+new Date)+a++}function r(t){var e={jsonrpc:s,method:t};return arguments.length>1&&(e.params=[].slice.call(arguments,1)),e}var o=t(71),s="2.0",a=0;i.prototype._generateId=function(){return this.idPrefix+this.idIterator++},i.prototype.notify=function(){this.dispatcher.send(r.apply(null,arguments))},i.prototype.request=function(){var t=r.apply(null,arguments);return t.id=this._generateId(),this.dispatcher.send(t).then(function(t){return"result"in t?t.result:o.reject(t.error)})},e.exports=i},{71:71}],28:[function(t,e,n){e.exports={PARSE_ERROR:{code:-32700,message:"Parse error"},INVALID_REQUEST:{code:-32600,message:"Invalid Request"},INVALID_PARAMS:{code:-32602,message:"Invalid params"},METHOD_NOT_FOUND:{code:-32601,message:"Method not found"},INTERNAL_ERROR:{code:-32603,message:"Internal error"}}},{}],29:[function(t,e,n){function i(t){this.registry=t||{}}function r(t){return h.isType("string",t)?JSON.parse(t):t}function o(t){var e,n,i;return h.isObject(t)?(e=t.jsonrpc===m,n=h.isType("string",t.method),i=!("id"in t)||s(t.id),e&&n&&i):!1}function s(t){var e,n,i;return e=h.isType("string",t),n=h.isType("number",t),i=null===t,e||n||i}function a(t){return h.isObject(t)&&!h.isType("function",t)}function c(t,e){return{jsonrpc:m,id:t,result:e}}function u(t,e){return{jsonrpc:m,id:s(t)?t:null,error:e}}function l(t){return f.all(t).then(function(t){return t=t.filter(function(t){return void 0!==t}),t.length?t:void 0})}var d=t(28),h=t(79),f=t(71),p=t(72),m="2.0";i.prototype._invoke=function(t,e){var n,i,r;n=this.registry[t.method],i=t.params||[],i=h.isType("array",i)?i:[i];try{r=n.apply(e.source||null,i)}catch(o){r=f.reject(o.message)}return p.isPromise(r)?r:f.resolve(r)},i.prototype._processRequest=function(t,e){function n(e){return c(t.id,e)}function i(){return u(t.id,d.INTERNAL_ERROR)}var r;return o(t)?(r="params"in t&&!a(t.params)?f.resolve(u(t.id,d.INVALID_PARAMS)):this.registry[t.method]?this._invoke(t,{source:e}).then(n,i):f.resolve(u(t.id,d.METHOD_NOT_FOUND)),null!=t.id?r:f.resolve()):f.resolve(u(t.id,d.INVALID_REQUEST))},i.prototype.attachReceiver=function(t){return t.attachTo(this),this},i.prototype.bind=function(t,e){return this.registry[t]=e,this},i.prototype.receive=function(t,e){var n,i,o,s=this;try{t=r(t)}catch(a){return f.resolve(u(null,d.PARSE_ERROR))}return e=e||null,n=h.isType("array",t),i=n?t:[t],o=i.map(function(t){return s._processRequest(t,e)}),n?l(o):o[0]},e.exports=i},{28:28,71:71,72:72,79:79}],30:[function(t,e,n){function i(t,e,n){var i;t&&t.postMessage&&(m?i=(n||"")+JSON.stringify(e):n?(i={},i[n]=e):i=e,t.postMessage(i,"*"))}function r(t){return f.isType("string",t)?t:"JSONRPC"}function o(t,e){return e?f.isType("string",t)&&0===t.indexOf(e)?t.substring(e.length):t[e]?t[e]:void 0:t}function s(t,e){var n=t.document;this.filter=r(e),this.server=null,this.isTwitterFrame=p.isTwitterURL(n.location.href),t.addEventListener("message",this._onMessage.bind(this),!1)}function a(t,e){this.pending={},this.target=t,this.isTwitterHost=p.isTwitterURL(u.href),this.filter=r(e),l.addEventListener("message",this._onMessage.bind(this),!1)}function c(t){return arguments.length>0&&(m=!!t),m}var u=t(14),l=t(16),d=t(70),h=t(62),f=t(79),p=t(75),m=h.ie9();f.aug(s.prototype,{_onMessage:function(t){var e,n=this;this.server&&(!this.isTwitterFrame||p.isTwitterURL(t.origin))&&(e=o(t.data,this.filter),e&&this.server.receive(e,t.source).then(function(e){e&&i(t.source,e,n.filter)}))},attachTo:function(t){this.server=t},detach:function(){this.server=null}}),f.aug(a.prototype,{_processResponse:function(t){var e=this.pending[t.id];e&&(e.resolve(t),delete this.pending[t.id])},_onMessage:function(t){var e;if((!this.isTwitterHost||p.isTwitterURL(t.origin))&&(e=o(t.data,this.filter))){if(f.isType("string",e))try{e=JSON.parse(e)}catch(n){return}e=f.isType("array",e)?e:[e],e.forEach(this._processResponse.bind(this))}},send:function(t){var e=new d;return t.id?this.pending[t.id]=e:e.resolve(),i(this.target,t,this.filter),e.promise}}),e.exports={Receiver:s,Dispatcher:a,_stringifyPayload:c}},{14:14,16:16,62:62,70:70,75:75,79:79}],31:[function(t,e,n){function i(t,e,n,i){var s,u=this;this.readyDeferred=new o,this.attrs=t||{},this.styles=e||{},this.appender=n||function(t){r.body.appendChild(t)},this.layout=i||function(t){return c.resolve(t())},this.frame=s=a(this.attrs,this.styles),s.onreadystatechange=s.onload=this.getCallback(this.onLoad),this.layout(function(){u.appender(s)})}var r=t(13),o=t(70),s=t(62),a=t(65),c=t(71),u=t(20),l=0;i.prototype.getCallback=function(t){var e=this,n=!1;return function(){n||(n=!0,t.call(e))}},i.prototype.registerCallback=function(t){var e="cb"+l++;return u.set(["sandbox",e],t),e},i.prototype.onLoad=function(){try{this.document=this.frame.contentWindow.document}catch(t){return void this.setDocDomain()}this.writeStandardsDoc(),this.readyDeferred.resolve(this)},i.prototype.ready=function(){return this.readyDeferred.promise},i.prototype.setDocDomain=function(){var t=this,e=a(this.attrs,this.styles),n=this.registerCallback(this.getCallback(this.onLoad));e.src=["javascript:",'document.write("");',"try { window.parent.document; }","catch (e) {",'document.domain="'+r.domain+'";',"}","window.parent."+u.fullPath(["sandbox",n])+"();"].join(""),this.layout(function(){t.frame.parentNode.removeChild(t.frame),t.frame=null,t.appender?t.appender(e):r.body.appendChild(e),t.frame=e})},i.prototype.writeStandardsDoc=function(){if(s.anyIE()&&!s.cspEnabled()){var t=["<!DOCTYPE html>","<html>","<head>","<scr","ipt>","try { window.parent.document; }",'catch (e) {document.domain="'+r.domain+'";}',"</scr","ipt>","</head>","<body></body>","</html>"].join("");this.document.write(t),this.document.close()}},e.exports=i},{13:13,20:20,62:62,65:65,70:70,71:71}],32:[function(t,e,n){function i(){var t,e;y={},s||(t=a.body.offsetHeight,e=a.body.offsetWidth,(t!=b||e!=w)&&(v.forEach(function(t){t.dispatchFrameResize(w,b)}),b=t,w=e))}function r(t){var e;return t.id?t.id:(e=t.getAttribute("data-twttr-id"))?e:(e="twttr-sandbox-"+g++,t.setAttribute("data-twttr-id",e),e)}function o(t,e){var n=this;l.apply(this,[t,e]),this._resizeHandlers=[],v=v.filter(function(t){var e=t._frame.parentElement;return e||f.async(function(){p.removeDelegatesForWidget(t._frame.id)}),e}),v.push(this),this._win.addEventListener("resize",function(){n.dispatchFrameResize()},!1)}var s,a=t(13),c=t(16),u=t(31),l=t(33),d=t(62),h=t(71),f=t(79),p=t(9),m=t(8),g=0,v=[],y={},w=0,b=0;c.addEventListener("resize",i,!1),o.prototype=new l,f.aug(o.prototype,{_addStyleSheet:function(t,e,n){function i(){var t=o._head.children[0];return t?o._head.insertBefore(s,t):o._head.appendChild(s)}function r(){return o._head.appendChild(s)}var o=this,s=this._doc.createElement("link");return s.type="text/css",s.rel="stylesheet",s.href=t,n&&(s.onload=n),this.layout(e?i:r)},dispatchFrameResize:function(){var t=this._frame.parentNode,e=r(t),n=y[e];s=!0,this._resizeHandlers.length&&(n||(n=y[e]={w:this._frame.offsetWidth,h:this._frame.offsetHeight}),(this._frameWidth!=n.w||this._frameHeight!=n.h)&&(this._frameWidth=n.w,this._frameHeight=n.h,this._resizeHandlers.forEach(function(t){t(n.w,n.h)}),c.setTimeout(function(){y={}},50)))},addClass:function(t){var e=this._doc.documentElement;return this.layout(function(){m.add(e,t)})},prependStyleSheet:function(t,e){return this._addStyleSheet(t,!0,e)},appendStyleSheet:function(t,e){return this._addStyleSheet(t,!1,e)},removeStyleSheet:function(t){var e,n=this;return e='link[rel="stylesheet"][href="'+t+'"]',this.layout(function(){var t=n._doc.querySelector(e);return t&&n._head.removeChild(t)})},appendCss:function(t){var e,n=this;return d.cspEnabled()?h.reject("CSP enabled; cannot embed inline styles."):(e=this._doc.createElement("style"),e.type="text/css",e.styleSheet?e.styleSheet.cssText=t:e.appendChild(this._doc.createTextNode(t)),this.layout(function(){return n._head.appendChild(e)}))},style:function(t,e){var n=this;return this.layout(function(){e&&(n._frame.style.cssText=""),f.forIn(t,function(t,e){n._frame.style[t]=e})})},onresize:function(t){this._resizeHandlers.push(t)},width:function(t){return void 0!==t&&(this._frame.style.width=t+"px"),d.ios()?Math.min(this._frame.parentNode.offsetWidth,this._frame.offsetWidth):this._frame.offsetWidth},height:function(t){return void 0!==t&&(this._frame.height=t),this._frame.offsetHeight},contentHeight:function(){return this._doc.body.firstChild.offsetHeight},hasContent:function(){return!!this._doc.body.firstChild},resizeToContent:function(){var t=this;return this.layout(function(){return t.height(t.contentHeight())})}}),o.createSandbox=function(t,e,n,i){var r=new u(t,e,n,i);return r.ready().then(function(t){return new o(t.frame,t.layout)})},e.exports=o},{13:13,16:16,31:31,33:33,62:62,71:71,79:79,8:8,9:9}],33:[function(t,e,n){function i(t,e){t&&(this._frame=t,this._win=t.contentWindow,this._doc=this._win.document,this._body=this._doc.body,this._head=this._body.parentNode.children[0],this.layout=e,this.root=this._doc.documentElement,this.root.className="SandboxRoot")}var r=t(31),o=t(79);o.aug(i.prototype,{createElement:function(t){return this._doc.createElement(t)},createDocumentFragment:function(){return this._doc.createDocumentFragment()},appendChild:function(t){var e=this;return this.layout(function(){return e._body.appendChild(t)})},setBaseTarget:function(t){var e=this,n=this._doc.createElement("base");return n.target=t,this.layout(function(){return e._head.appendChild(n)})},setTitle:function(t){t&&(this._frame.title=t)},element:function(){return this._frame},document:function(){return this._doc}}),i.createSandbox=function(t,e,n,o){var s=new r(t,e,n,o);return s.ready().then(function(t){return new i(t.frame,t.layout)})},e.exports=i},{31:31,79:79}],34:[function(t,e,n){function i(){return l.formatGenericEventData("syndicated_impression",{})}function r(){c("tweet")}function o(){c("timeline")}function s(){c("video")}function a(){c("partnertweet")}function c(t){d.isHostPageSensitive()||h[t]||(h[t]=!0,u.scribe(l.formatClientEventNamespace({page:t,action:"impression"}),i(),l.AUDIENCE_ENDPOINT))}var u=t(38),l=t(39),d=t(74),h={};e.exports={scribeAudienceImpression:c,scribePartnerTweetAudienceImpression:a,scribeTweetAudienceImpression:r,scribeTimelineAudienceImpression:o,scribeVideoAudienceImpression:s}},{38:38,39:39,74:74}],35:[function(t,e,n){function i(t){return t?(t=Array.isArray(t)?t:[t],t.reduce(function(t,e){var n=e.getAttribute("data-tweet-id"),i=e.getAttribute("data-rendered-tweet-id")||n;return n===i?t[i]={item_type:r.TWEET}:n&&(t[i]={item_type:r.RETWEET,target_type:r.TWEET,target_id:n}),t},{})):{}}var r=t(37);e.exports=i},{37:37}],36:[function(t,e,n){function i(){return x?I.promise:(m.createSandbox({id:"rufous-sandbox"},{display:"none"}).then(function(t){h=t,l=c(),d=u(),I.resolve([l,d])}),x=!0,I.promise)}function r(t,e){var n,i,r;w.isObject(t)&&w.isObject(e)&&(r=y.flattenClientEventPayload(t,e),n=l.firstChild,n.value=+(+n.value||r.dnt||0),i=h.createElement("input"),i.type="hidden",i.name="l",i.value=y.stringify(r),l.appendChild(i))}function o(t,e,n){var i=!w.isObject(t),o=e?!w.isObject(e):!1;i||o||I.promise.then(function(){r(y.formatClientEventNamespace(t),y.formatClientEventData(e,n))})}function s(){return I.promise.then(function(){if(l.children.length<=2)return v.reject();var t=v.all([h.appendChild(l),h.appendChild(d)]).then(function(t){var e=t[0],n=t[1];return n.addEventListener("load",function(){a(e,n)(),b.get("events").trigger("logFlushed")}),e.submit(),t});return l=c(),d=u(),t})}function a(t,e){return function(){var n=t.parentNode;n&&(n.removeChild(t),n.removeChild(e))}}function c(){var t=h.createElement("form"),e=h.createElement("input"),n=h.createElement("input");return T++,t.action=y.CLIENT_EVENT_ENDPOINT,t.method="POST",t.target=E+T,t.id=A+T,e.type="hidden",e.name="dnt",e.value=p.enabled(),n.type="hidden",n.name="tfw_redirect",n.value=y.RUFOUS_REDIRECT,t.appendChild(e),t.appendChild(n),t}function u(){var t=E+T;return f({id:t,name:t,width:0,height:0,border:0},{display:"none"},h.document())}var l,d,h,f=t(65),p=t(61),m=t(33),g=t(70),v=t(71),y=t(39),w=t(79),b=t(21),_=Math.floor(1e3*Math.random())+"_",E="rufous-frame-"+_+"-",A="rufous-form-"+_+"-",T=0,x=!1,I=new g;e.exports={clientEvent:o,flush:s,init:i}},{21:21,33:33,39:39,61:61,65:65,70:70,71:71,79:79}],37:[function(t,e,n){e.exports={TWEET:0,RETWEET:10,CUSTOM_TIMELINE:17}},{}],38:[function(t,e,n){function i(t,e,n){return r(t,e,n,2)}function r(t,e,n,i){var r=!p.isObject(t),o=e?!p.isObject(e):!1;r||o||s(f.formatClientEventNamespace(t),f.formatClientEventData(e,n,i),f.CLIENT_EVENT_ENDPOINT)}function o(t,e,n,i){var o=f.extractTermsFromDOM(t.target||t.srcElement);o.action=i||"click",r(o,e,n)}function s(t,e,n){var i,r;n&&p.isObject(t)&&p.isObject(e)&&(i=f.flattenClientEventPayload(t,e),r={l:f.stringify(i)},i.dnt&&(r.dnt=1),l(h.url(n,r)))}function a(t,e,n,i){var r,o=!p.isObject(t),s=e?!p.isObject(e):!1;if(!o&&!s)return r=f.flattenClientEventPayload(f.formatClientEventNamespace(t),f.formatClientEventData(e,n,i)),c(r)}function c(t){return g.push(t),g}function u(){var t,e,n=h.url(f.CLIENT_EVENT_ENDPOINT,{dnt:0,l:""}),i=encodeURIComponent(n).length;return g.length>1&&a({page:"widgets_js",component:"scribe_pixel",action:"batch_log"},{}),t=g,g=[],e=t.reduce(function(e,n,r){var o,s,a=e.length,c=a&&e[a-1],u=r+1==t.length;return u&&n.event_namespace&&"batch_log"==n.event_namespace.action&&(n.message=["entries:"+r,"requests:"+a].join("/")),o=f.stringify(n),s=encodeURIComponent(o).length+3,i+s>m?e:((!c||c.urlLength+s>m)&&(c={urlLength:i,items:[]},e.push(c)),c.urlLength+=s,c.items.push(o),e)},[]),e.map(function(t){var e={l:t.items};return d.enabled()&&(e.dnt=1),l(h.url(f.CLIENT_EVENT_ENDPOINT,e))})}function l(t){var e=new Image;return e.src=t}var d=t(61),h=t(73),f=t(39),p=t(79),m=2083,g=[];e.exports={_enqueueRawObject:c,scribe:s,clientEvent:r,clientEvent2:i,enqueueClientEvent:a,flushClientEvents:u,interaction:o}},{39:39,61:61,73:73,79:79}],39:[function(t,e,n){function i(t,e){var n;return e=e||{},t&&t.nodeType===Node.ELEMENT_NODE?((n=t.getAttribute("data-scribe"))&&n.split(" ").forEach(function(t){var n=t.trim().split(":"),i=n[0],r=n[1];i&&r&&!e[i]&&(e[i]=r)}),i(t.parentNode,e)):e}function r(t){return d.aug({client:"tfw"},t||{})}function o(t,e,n){var i=t&&t.widget_origin||u.referrer;return t=s("tfw_client_event",t,i),t.client_version=p,t.format_version=void 0!==n?n:1,e||(t.widget_origin=i),t}function s(t,e,n){return e=e||{},d.aug({},e,{_category_:t,triggered_on:e.triggered_on||+new Date,dnt:l.enabled(n)})}function a(t,e){return d.aug({},e,{
event_namespace:t})}function c(t){var e,n=Array.prototype.toJSON;return delete Array.prototype.toJSON,e=JSON.stringify(t),n&&(Array.prototype.toJSON=n),e}var u=t(13),l=t(61),d=t(79),h=t(81),f=t(20),p=h.version,m=f.get("endpoints.rufous")||"https://syndication.twitter.com/i/jot",g=f.get("endpoints.rufousAudience")||"https://syndication.twitter.com/i/jot/syndication",v=f.get("endpoints.rufousRedirect")||"https://platform.twitter.com/jot.html";e.exports={extractTermsFromDOM:i,flattenClientEventPayload:a,formatGenericEventData:s,formatClientEventData:o,formatClientEventNamespace:r,stringify:c,AUDIENCE_ENDPOINT:g,CLIENT_EVENT_ENDPOINT:m,RUFOUS_REDIRECT:v}},{13:13,20:20,61:61,79:79,81:81}],40:[function(t,e,n){function i(t,e,n,i){return t=t||[],n=n||{},function(){var r,o,c,l,d=Array.prototype.slice.apply(arguments,[0,t.length]),h=Array.prototype.slice.apply(arguments,[t.length]);return h.forEach(function(t){return t?1===t.nodeType?void(c=t):s.isType("function",t)?void(r=t):void(s.isType("object",t)&&(o=t)):void 0}),d.length!=t.length||0===h.length?(r&&s.async(function(){r(!1)}),a.reject("Not enough parameters")):c?(o=s.aug(o||{},n),o.targetEl=c,t.forEach(function(t){o[t]=d.shift()}),l=new e(o),u.doLayout(),l.render(),i&&i(),r&&l.completed().then(r,function(){r(!1)}),l.completed()):(r&&s.async(function(){r(!1)}),a.reject("No target specified"))}}function r(t){var e;t.linkColor=t.linkColor||t.previewParams.link_color,t.theme=t.theme||t.previewParams.theme,t.height=t.height||t.previewParams.height,e=new p(t),this.render=e.render.bind(e),this.completed=e.completed.bind(e)}var o=t(16),s=t(79),a=t(71),c=t(75),u=t(49),l=t(55),d=t(51),h=t(50),f=t(56),p=t(54),m=i(["url"],l,{type:"share"}),g=i(["hashtag"],l,{type:"hashtag"}),v=i(["screenName"],l,{type:"mention"}),y=i(["screenName"],d),w=i(["tweetId"],h,{},h.fetchAndRender),b=i(["tweetId"],f,{},f.fetchAndRender),_=i(["widgetId"],p),E=i(["previewParams"],r),A={createShareButton:m,createMentionButton:v,createHashtagButton:g,createFollowButton:y,createTweet:w,createVideo:b,createTweetEmbed:w,createTimeline:_};c.isTwitterURL(o.location.href)&&(A.createTimelinePreview=E),e.exports=A},{16:16,49:49,50:50,51:51,54:54,55:55,56:56,71:71,75:75,79:79}],41:[function(t,e,n){function i(t,e){var n=u.connect({src:t,iframe:{name:e,style:"position:absolute;top:-9999em;width:10px;height:10px"}});return l(n).expose({trigger:function(t,e,n){e=e||{};var i=e.region;delete e.region,f.get("events").trigger(t,{target:d.find(n),data:e,region:i,type:t})},initXPHub:function(){o(!0)}}),n}function r(t){return t?h.secureHubId:h.contextualHubId}function o(t){var e=c.base(t)+"/widgets/hub.37638732bcf6df3115558c59e29ab4be.html",n=r(t);if(!a.getElementById(n))return i(e,n)}function s(t,e){var n=u.connect({window:{width:550,height:450},src:t});l(n).expose({trigger:function(t,n){f.get("events").trigger(t,{target:e,region:"intent",type:t,data:n})}})}var a=t(13),c=t(43),u=t(90),l=t(89),d=t(49),h=t(80),f=t(21);e.exports={init:o,openIntent:s}},{13:13,21:21,43:43,49:49,80:80,89:89,90:90}],42:[function(t,e,n){function i(){return o!==o.top?r.request(d).then(function(t){s.rootDocumentLocation(t.url),t.dnt&&a.setOn()}):void 0}var r,o=t(16),s=t(59),a=t(61),c=t(29),u=t(27),l=t(30),d="twttr.private.requestArticleUrl",h="twttr.article";o===o.top?(new c).attachReceiver(new l.Receiver(o,h)).bind(d,function(){return{url:s.rootDocumentLocation(),dnt:a.enabled()}}):r=new u(new l.Dispatcher(o.top,h)),e.exports={requestArticleUrl:i}},{16:16,27:27,29:29,30:30,59:59,61:61}],43:[function(t,e,n){function i(t,e){var n,i=u[t];return"embed/timeline.css"===t&&c.contains(o.href,"localhost.twitter.com")?"/node_modules/syndication-templates/lib/css/index.css":(n=a.retina()?"2x":"default",e&&(n+=".rtl"),r()+"/"+i[n])}function r(t){var e=s.get("host");return l(t)+"://"+e}var o=t(14),s=t(20),a=t(62),c=t(79),u={"embed/timeline.css":{"default":"embed/timeline.b67ffafa652943d0ebac45e422e410f7.default.css","2x":"embed/timeline.b67ffafa652943d0ebac45e422e410f7.2x.css",gif:"embed/timeline.b67ffafa652943d0ebac45e422e410f7.gif.css","default.rtl":"embed/timeline.b67ffafa652943d0ebac45e422e410f7.default.rtl.css","2x.rtl":"embed/timeline.b67ffafa652943d0ebac45e422e410f7.2x.rtl.css","gif.rtl":"embed/timeline.b67ffafa652943d0ebac45e422e410f7.gif.rtl.css"}},l=function(){return/^http\:$/.test(o.protocol)?function(t){return t?"https":"http"}:function(){return"https"}}();e.exports={builtUrl:i,base:r}},{14:14,20:20,62:62,79:79}],44:[function(t,e,n){var i=t(14),r=t(20),o=t(79),s=t(5),a=t(4),c=t(6),u={},l=o.aug({tweets:"https://syndication.twitter.com/tweets.json",timeline:"https://cdn.syndication.twimg.com/widgets/timelines/",timelinePoll:"https://syndication.twitter.com/widgets/timelines/paged/",timelinePreview:"https://syndication.twitter.com/widgets/timelines/preview/",videos:"https://syndication.twitter.com/widgets/video/"},r.get("endpoints")||{});u.tweets=function(t){var e={ids:t.ids.join(","),lang:t.lang,new_html:!0};return s.fetch(l.tweets,e,a)},u.videos=function(t){return s.fetch(l.videos,{ids:t.ids.join(","),lang:t.lang},a)},u.timeline=function(t){var e="tl_"+t.id+"_"+t.instanceId,n=9e5,r=Math.floor(+new Date/n),a={lang:t.lang,t:r,domain:i.host,dnt:t.dnt,override_type:t.overrideType,override_id:t.overrideId,override_name:t.overrideName,override_owner_id:t.overrideOwnerId,override_owner_name:t.overrideOwnerName,with_replies:t.withReplies};return o.compact(a),s.fetch(l.timeline+t.id,a,c,e)},u.timelinePoll=function(t){var e=t.sinceId||t.maxId||t.maxPosition||t.minPosition,n="tlPoll_"+t.id+"_"+t.instanceId+"_"+e,r={lang:t.lang,since_id:t.sinceId,max_id:t.maxId,min_position:t.minPosition,max_position:t.maxPosition,domain:i.host,dnt:t.dnt,override_type:t.overrideType,override_id:t.overrideId,override_name:t.overrideName,override_owner_id:t.overrideOwnerId,override_owner_name:t.overrideOwnerName,with_replies:t.withReplies};return o.compact(r),s.fetch(l.timelinePoll+t.id,r,c,n)},u.timelinePreview=function(t){return s.fetch(l.timelinePreview,t.params,c)},e.exports=u},{14:14,20:20,4:4,5:5,6:6,79:79}],45:[function(t,e,n){function i(){var t=36e5,e=s.combined(o)._;return void 0!==r?r:(r=!1,e&&/^\d+$/.test(e)&&(r=+new Date-parseInt(e)<t),r)}var r,o=t(14),s=t(69);e.exports={isDynamicWidget:i}},{14:14,69:69}],46:[function(t,e,n){function i(t){var e=t.split(" ");this.url=decodeURIComponent(e[0].trim()),this.width=+e[1].replace(/w$/,"").trim()}function r(t,e,n){var r,o,s,a;if(t=p.devicePixelRatio?t*p.devicePixelRatio:t,o=e.split(",").map(function(t){return new i(t.trim())}),n)for(a=0;a<o.length;a++)o[a].url===n&&(r=o[a]);return s=o.reduce(function(e,n){return n.width<e.width&&n.width>=t?n:e},o[0]),r&&r.width>s.width?r:s}function o(t,e){var n,i=t.getAttribute("data-srcset"),o=t.src;i&&(n=r(e,i,o),t.src=n.url)}function s(t,e){e=void 0!==e?!!e:g.retina(),m.toRealArray(t.getElementsByTagName("IMG")).forEach(function(t){var n=t.getAttribute("data-src-1x")||t.getAttribute("src"),i=t.getAttribute("data-src-2x");e&&i?t.src=i:n&&(t.src=n)})}function a(t,e,n){t&&(m.toRealArray(t.querySelectorAll(".NaturalImage-image")).forEach(function(t){n(function(){o(t,e)})}),m.toRealArray(t.querySelectorAll(".CroppedImage-image")).forEach(function(t){n(function(){o(t,e/2)})}),m.toRealArray(t.querySelectorAll("img.autosized-media")).forEach(function(t){n(function(){o(t,e),t.removeAttribute("width"),t.removeAttribute("height")})}))}function c(t,e,n,i){t&&((g.ios()||g.android())&&m.toRealArray(t.querySelectorAll(".FilledIframe")).forEach(function(t){i(function(){d(t,{width:t.offsetWidth,height:t.offsetHeight})})}),m.toRealArray(t.querySelectorAll("iframe.autosized-media")).forEach(function(t){var r=l(t.getAttribute("data-width"),t.getAttribute("data-height"),y.effectiveWidth(t.parentElement)||e,n);i(function(){t.width=r.width,t.height=r.height,d(t,r)})}))}function u(t,e,n,i){a(t,e,i),c(t,e,n,i)}function l(t,e,n,i,r,o){return n=n||t,i=i||e,r=r||0,o=o||0,t>n&&(e*=n/t,t=n),e>i&&(t*=i/e,e=i),r>t&&(e*=r/t,t=r),o>e&&(t*=o/e,e=o),{width:Math.floor(t),height:Math.floor(e)}}function d(t,e){function n(){var t={name:"tfw:resize",dimensions:e};r.postMessage(t,"*")}var i,r,o,s,a;t&&(r=t.contentWindow,i=t.ownerDocument&&t.ownerDocument.defaultView,o=g.ios()||g.android(),s=v.isTwitterURL(t.src),a=r&&g.canPostMessage(r),o&&s&&a&&(n(),i&&i.addEventListener("message",function(t){"tfw:requestsize"===t.data&&n()},!1)))}function h(t,e,n,i){m.toRealArray(t.querySelectorAll(e)).forEach(function(t){var e=t.getAttribute("style")||t.getAttribute("data-style"),r=i.test(e)&&RegExp.$1;r&&(t.setAttribute("data-csp-fix",!0),t.style[n]=r)})}function f(t){g.cspEnabled()&&(h(t,".MediaCard-widthConstraint","maxWidth",w),h(t,".MediaCard-mediaContainer","paddingBottom",E),h(t,".CroppedImage-image","top",b),h(t,".CroppedImage-image","left",_))}var p=t(16),m=t(79),g=t(62),v=t(75),y=t(12),w=/max-width:\s*([\d\.]+px)/,b=/top:\s*(\-?[\d\.]+%)/,_=/left:\s*(\-?[\d\.]+%)/,E=/padding-bottom:\s*([\d\.]+%)/;e.exports={scaleDimensions:l,retinize:s,setSrcForImgs:a,sizeIframes:c,constrainMedia:u,fixMediaCardLayout:f,__setSrcFromSet:o}},{12:12,16:16,62:62,75:75,79:79}],47:[function(t,e,n){var i=t(73),r=t(75);e.exports=function(t,e){return function(n){var o,s,a="data-tw-params";if(n&&r.isTwitterURL(n.href)&&!n.getAttribute(a)){if(n.setAttribute(a,!0),"function"==typeof e){o=e.call(this,n);for(s in o)o.hasOwnProperty(s)&&(t[s]=o[s])}n.href=i.url(n.href,t)}}}},{73:73,75:75}],48:[function(t,e,n){function i(t){(new o).attachReceiver(new s.Receiver(r,"twttr.resize")).bind("twttr.private.resizeButton",function(e){var n=c(this),i=n&&n.id,r=a.asInt(e.width),o=a.asInt(e.height);i&&r&&o&&t(i,r,o)})}var r=t(16),o=t(29),s=t(30),a=t(76),c=t(64);e.exports=i},{16:16,29:29,30:30,64:64,76:76}],49:[function(t,e,n){function i(t){var e;t&&(t.ownerDocument?(this.srcEl=t,this.classAttr=t.className.split(" ")):(this.srcOb=t,this.classAttr=[]),e=this.params(),this.id=this.generateId(),this.setLanguage(),this.related=e.related||this.dataAttr("related"),this.partner=e.partner||this.dataAttr("partner")||y.val("partner"),this.styleAttr=[],this.targetEl=t.targetEl,g.asBoolean(e.dnt||this.dataAttr("dnt"))&&w.setOn(),x[this.id]=this,this.completeDeferred=new d,this.completed().then(function(t){t&&t!=a.body&&E.get("events").trigger("rendered",{target:t})}))}function r(){I.forEach(function(t){t()}),i.doLayout()}function o(t){return t?t.lang?t.lang:o(t.parentNode):void 0}var s,a=t(13),c=t(16),u=t(43),l=t(26),d=t(70),h=t(65),f=t(66),p=t(71),m=t(73),g=t(76),v=t(79),y=t(19),w=t(61),b=t(67),_=t(59),E=t(21),A=t(22),T=0,x={},I=[],S=new f,D="data-twttr-rendered";v.aug(i.prototype,{setLanguage:function(t){var e;return t||(t=this.params().lang||this.dataAttr("lang")||o(this.srcEl)),(t=t&&t.toLowerCase())?v.contains(A,t)?this.lang=t:(e=t.replace(/[\-_].*/,""),v.contains(A,e)?this.lang=e:void(this.lang="en")):this.lang="en"},ringo:function(t,e,n){return n=n||/\{\{([\w_]+)\}\}/g,t.replace(n,function(t,n){return void 0!==e[n]?e[n]:t})},makeIframeSource:function(){if(this.iframeSource){var t=m.encode(this.widgetUrlParams());return[u.base(),"/",this.ringo(this.iframeSource,{lang:this.lang}),"#",t].join("")}},add:function(t){x[this.id]=t},create:function(t,e){var n,i=this;return e[D]=!0,n=h(v.aug({id:this.id,src:t,"class":this.classAttr.join(" ")},e),{position:"absolute",visibility:"hidden"},this.targetEl&&this.targetEl.ownerDocument),this.srcEl?this.layout(function(){return i.srcEl.parentNode.replaceChild(n,i.srcEl),n}):this.targetEl?this.layout(function(){return i.targetEl.appendChild(n),n}):p.reject("Did not append widget")},setInitialSize:function(t,e){var n=this,i=this.element;return i?void this.layout(function(){n.width=t,n.height=e,i.style.width=t+"px",i.style.height=e+"px",i.style.position="static",i.style.visibility="visible"}).then(function(){n.completeDeferred.resolve(i)}):!1},params:function(){var t,e;return this.srcOb?e=this.srcOb:(t=this.srcEl&&this.srcEl.href&&this.srcEl.href.split("?")[1],e=t?m.decode(t):{}),this.params=function(){return e},e},widgetUrlParams:function(){return{}},dataAttr:function(t){return this.srcEl&&this.srcEl.getAttribute("data-"+t)},attr:function(t){return this.srcEl&&this.srcEl.getAttribute(t)},layout:function(t){return S.enqueue(t)},generateId:function(){return this.srcEl&&this.srcEl.id||"twitter-widget-"+T++},completed:function(){return this.completeDeferred?this.completeDeferred.promise:void 0}}),i.afterLoad=function(t){I.push(t)},i.doLayout=function(){S.exec()},i.doLayoutAsync=function(){S.delayedExec()},i.init=function(t){s=t},i.reset=function(){x={}},i.findInstance=function(t){return t&&x[t]?x[t]:null},i.find=function(t){var e=i.findInstance(t);return e&&e.element||null},i.embed=function(t){var e=[],n=[],o=[];g.isArray(t)||(t=[t||a]),b.time("sandboxes"),t.forEach(function(t){v.forIn(s,function(n,i){var r=t.querySelectorAll(n);v.toRealArray(r).forEach(function(t){var n;t.getAttribute(D)||(t.setAttribute(D,"true"),n=new i(t),e.push(n),o.push(n.sandboxCreated))})})}),p.all(o).then(function(){b.timeEnd("sandboxes")}),i.doLayout(),e.forEach(function(t){n.push(t.completed()),t.render()}),p.all(n).then(function(t){t=t.filter(function(t){return t}),t.length&&(E.get("events").trigger("loaded",{widgets:t}),b.timeEnd("load"))}).then(i.trackRender),i.doLayoutAsync(),r()},i.trackRender=function(){l.endAndTrack("render","widgets-js-load","page",{widget_origin:_.rootDocumentLocation(),widget_frame:_.isFramed()&&_.currentDocumentLocation()})},c.setInterval(function(){i.doLayout()},500),e.exports=i},{13:13,16:16,19:19,21:21,22:22,26:26,43:43,59:59,61:61,65:65,66:66,67:67,70:70,71:71,73:73,76:76,79:79}],50:[function(t,e,n){function i(t,e){var n=t.querySelector("blockquote.subject"),i=t.querySelector("blockquote.reply"),r=n&&n.getAttribute("data-tweet-id"),o=i&&i.getAttribute("data-tweet-id"),s={},a={};r&&(s[r]={item_type:0},A.clientEvent({page:"tweet",section:"subject",component:"tweet",action:"results"},w.aug({},e,{item_ids:[r],item_details:s}),!0),E.scribeTweetAudienceImpression(),o&&(a[o]={item_type:0},A.clientEvent({page:"tweet",section:"conversation",component:"tweet",action:"results"},w.aug({},e,{item_ids:[o],item_details:a,associations:{4:{association_id:r,association_type:4}}}),!0)))}function r(t,e){var n={};t&&(n[t]={item_type:0},A.clientEvent({page:"tweet",section:"subject",component:"rawembedcode",action:"no_results"},{widget_origin:x.rootDocumentLocation(),widget_frame:x.isFramed()&&x.currentDocumentLocation(),message:e,item_ids:[t],item_details:n},!0),E.scribeTweetAudienceImpression())}function o(t,e,n,i){P[t]=P[t]||[],P[t].push({s:n,f:i,lang:e})}function s(t){if(t){var e,n,i;d.apply(this,[t]),e=this.params(),n=this.srcEl&&this.srcEl.getElementsByTagName("A"),i=n&&n[n.length-1],this.hideThread="none"==(e.conversation||this.dataAttr("conversation"))||w.contains(this.classAttr,"tw-hide-thread"),this.hideCard="hidden"==(e.cards||this.dataAttr("cards"))||w.contains(this.classAttr,"tw-hide-media"),"left"==(e.align||this.attr("align"))||w.contains(this.classAttr,"tw-align-left")?this.align="left":"right"==(e.align||this.attr("align"))||w.contains(this.classAttr,"tw-align-right")?this.align="right":("center"==(e.align||this.attr("align"))||w.contains(this.classAttr,"tw-align-center"))&&(this.align="center",this.containerWidth>this.dimensions.MIN_WIDTH*(1/.7)&&this.width>.7*this.containerWidth&&(this.width=.7*this.containerWidth)),this.narrow=e.narrow||this.width<=this.dimensions.NARROW_WIDTH,this.tweetId=e.tweetId||i&&b.status(i.href)}}var a=t(3),c=t(16),u=t(11),l=t(49),d=t(53),h=t(7),f=t(47),p=t(8),m=t(10),g=t(26),v=t(71),y=t(72),w=t(79),b=t(75),_=t(44),E=t(34),A=t(36),T=t(46),x=t(59),I=t(83),S=t(21),D=t(9),N=t(38),C="tweetembed",P={},R=[];s.prototype=new d,w.aug(s.prototype,{renderedClassNames:"twitter-tweet twitter-tweet-rendered",dimensions:{DEFAULT_HEIGHT:"0",DEFAULT_WIDTH:"500",NARROW_WIDTH:"350",maxHeight:"375",FULL_BLEED_PHOTO_MAX_HEIGHT:"600",MIN_WIDTH:"220",MIN_HEIGHT:"0",MARGIN:"10px 0",WIDE_MEDIA_PADDING:32,NARROW_MEDIA_PADDING:32,BORDERS:0},linkColorSelectors:["a","a:visited"],linkStateColorSelectors:["a:hover","a:focus","a:active"],bgColorSelectors:[],borderColorSelectors:[],styleSheetUrl:a.tweet,addSiteStylesPrefix:function(t){return t},onStyleSheetLoad:function(){var t=this;this.sandbox.hasContent()&&(l.doLayoutAsync(),this.sandbox.resizeToContent().then(function(e){t.height=e}))},scribeCardShown:function(t){var e,n;e={page:"tweet",component:"card",action:"shown"},n={card_details:{card_name:t.getAttribute("data-card-name")}},N.clientEvent2(e,n,!1)},loadCardCss:function(t){function e(){r&&(l.doLayoutAsync(),n.sandbox.resizeToContent().then(function(t){n.height=t}))}var n=this,i=t&&t.getAttribute("data-css"),r=!1;i&&(w.toRealArray(t.querySelectorAll("img")).forEach(function(t){t.addEventListener("load",e,!1)}),this.sandbox.prependStyleSheet(i,function(){p.add(t,"is-ready"),n.scribeCardShown(t),l.doLayoutAsync(),n.sandbox.resizeToContent().then(function(t){r=!0,n.height=t})}))},create:function(t){var e,n,r,o=this,s=this.sandbox.createElement("div");return s.innerHTML=t,(e=s.children[0]||!1)?("dark"==this.theme&&this.classAttr.push("thm-dark"),this.linkColor&&this.addSiteStyles(),p.present(e,"media-forward")&&(this.fullBleedPhoto=!0,this.dimensions.maxHeight=this.dimensions.FULL_BLEED_PHOTO_MAX_HEIGHT),n=e.querySelector(".GifPlayer"),n&&(this.gifPlayer=new I({rootEl:n,videoEl:n.querySelector(".GifPlayer-video"),playButtonEl:n.querySelector(".GifPlayer-playButton"),fallbackUrl:this.extractPermalinkUrl(this.getTweetElement(e))})),T.retinize(e),T.fixMediaCardLayout(e),e.id=this.id,e.className+=" "+this.classAttr.join(" "),e.lang=this.lang,this.sandbox.setTitle(e.getAttribute("data-iframe-title")||"Tweet"),this.loadCardCss(e.querySelector(".PrerenderedCard")),this.sandbox.appendChild(e).then(function(){o.renderedDeferred.resolve(o.sandbox)}),r=this.layout(function(){o.predefinedWidth=o.width,o.width=o.sandbox.width(o.width),o.collapseRegions()}),r.then(function(){o.constrainMedia(e,o.contentWidth(o.width)),o.setNarrow().then(function(){o.layout(function(){o.completeDeferred.resolve(o.sandbox.element())})})}),i(e,this.baseScribeData(),this.partner),e):void 0},render:function(){var t=this,e="",n=this.tweetId;return n?(this.hideCard&&(e+="c"),this.hideThread&&(e+="t"),e&&(n+="-"+e),this.rendered().then(function(e){var n=t.srcEl;n&&n.parentNode&&t.layout(function(){n&&n.parentNode&&n.parentNode.removeChild(n)}),"center"==t.align?e.style({margin:"7px auto",cssFloat:"none"}):t.align&&(t.width==t.dimensions.DEFAULT_WIDTH&&(t.predefinedWidth=t.width=t.dimensions.NARROW_WIDTH),e.style({cssFloat:t.align})),t.sandbox.resizeToContent().then(function(e){return t.height=e,l.doLayoutAsync(),t.sandbox.resizeToContent().then(function(e){t.height=e})}).then(function(){e.onresize(t.handleResize.bind(t))}),e.style({position:"static",visibility:"visible"}),l.doLayoutAsync()}),o(n,this.lang,function(e){t.ready().then(function(){t.element=t.create(e),t.readTimestampTranslations(),t.updateTimeStamps(),t.bindIntentHandlers(),t.bindUIHandlers(),t.bindPermalinkHandler(),l.doLayoutAsync()})},function(){r(t.tweetId,t.partner),t.completeDeferred.resolve(t.srcEl)}),R.push(this.completed()),this.completed().then(this.scribePerformance.bind(this)),this.completed()):(this.completeDeferred.resolve(this.srcEl),this.completed())},bindPermalinkHandler:function(){var t=this;D.delegate(this.element,"click","A",function(t){D.stopPropagation(t)}),D.delegate(this.element,"click",".twitter-tweet",function(e){var n=t.getTweetElement();u.getSelectedText(t.sandbox._win)||(t.openPermalink(n),t.scribePermalinkClick(n,e),D.stopPropagation(e))})},scribePermalinkClick:function(t,e){var n=this.createScribeData(t);N.interaction(e,n,!1)},getTweetElement:function(t){var e;return t=t||this.element,t?(e=t.querySelectorAll("blockquote.tweet"),e[e.length-1]):void 0},extractPermalinkUrl:function(t){var e=t&&t.cite;return b.isStatus(e)&&e},openPermalink:function(t){var e=this.extractPermalinkUrl(t);e&&c.open(e)},scribePerformance:function(){g.endAndTrack("render","widgets-js-load","tweet",this.baseScribeData())},addUrlParams:function(t){var e=this,n={related:this.related,partner:this.partner,original_referer:x.rootDocumentLocation(),tw_p:C};return this.addUrlParams=f(n,function(t){var n=m.closest(".tweet",t,e.element);return{tw_i:n.getAttribute("data-tweet-id")}}),this.addUrlParams(t)},baseScribeData:function(){return{widget_origin:x.rootDocumentLocation(),widget_frame:x.isFramed()&&x.currentDocumentLocation(),message:this.partner}},handleResize:function(t){var e=this;t!=this.width&&(this.width=t,this.setNarrow(),this.constrainMedia(this.element,this.contentWidth(t)),this.collapseRegions(),this.sandbox.resizeToContent().then(function(t){e.height=t,S.get("events").trigger("resize",{target:e.sandbox.element()})}),l.doLayoutAsync())},readTimestampTranslations:function(){var t=this.element,e="data-dt-",n=t.getAttribute(e+"months")||"";this.datetime=new h(w.compact({phrases:{AM:t.getAttribute(e+"am"),PM:t.getAttribute(e+"pm")},months:n.split("|"),formats:{full:t.getAttribute(e+"full")}}))},updateTimeStamps:function(){var t=this.element.querySelector(".long-permalink"),e=t.getAttribute("data-datetime"),n=e&&this.datetime.localTimeStamp(e),i=t.getElementsByTagName("TIME")[0];n&&(this.layout(function(){return i&&i.innerHTML?void(i.innerHTML=n):void(t.innerHTML=n)},"Update Timestamp"),l.doLayoutAsync())}}),s.fetchAndRender=function(){function t(t){w.forIn(t,function(t,e){var n=i[t];n.forEach(function(t){t.s&&t.s.call(this,e)}),delete i[t]}),l.doLayout(),w.forIn(i,function(t,e){e.forEach(function(e){e.f&&e.f.call(this,t)})}),l.doLayout()}var e,n,i=P,r=[];if(P={},i.keys)r=i.keys();else for(e in i)i.hasOwnProperty(e)&&r.push(e);r.length&&(A.init(),n=i[r[0]][0].lang,y.always(_.tweets({ids:r.sort(),lang:n}),t),v.all(R).then(function(){A.flush()}),R=[])},l.afterLoad(s.fetchAndRender),e.exports=s},{10:10,11:11,16:16,21:21,26:26,3:3,34:34,36:36,38:38,44:44,46:46,47:47,49:49,53:53,59:59,7:7,71:71,72:72,75:75,79:79,8:8,83:83,9:9}],51:[function(t,e,n){function i(t){if(t){var e,n,i,r;s.apply(this,[t]),e=this.params(),n=e.size||this.dataAttr("size"),i=e.showScreenName||this.dataAttr("show-screen-name"),r=e.count||this.dataAttr("count"),this.classAttr.push("twitter-follow-button"),this.showScreenName="false"!=i,this.showCount=!(e.showCount===!1||"false"==this.dataAttr("show-count")),"none"==r&&(this.showCount=!1),this.explicitWidth=e.width||this.dataAttr("width")||"",this.screenName=e.screen_name||e.screenName||a.screenName(this.attr("href")),this.preview=e.preview||this.dataAttr("preview")||"",this.align=e.align||this.dataAttr("align")||"",this.size="large"==n?"l":"m"}}var r=t(61),o=t(79),s=t(49),a=t(75),c=t(71);i.prototype=new s,o.aug(i.prototype,{iframeSource:"widgets/follow_button.403b2a3ca10837290e034c22c8a16c06.{{lang}}.html",widgetUrlParams:function(){return o.compact({screen_name:this.screenName,lang:this.lang,show_count:this.showCount,show_screen_name:this.showScreenName,align:this.align,id:this.id,preview:this.preview,size:this.size,partner:this.partner,dnt:r.enabled(),_:+new Date})},render:function(){if(!this.screenName)return c.reject("Missing Screen Name");var t=this,e=this.makeIframeSource(),n=this.create(e,{title:"Twitter Follow Button"}).then(function(e){return t.element=e});return n}}),e.exports=i},{49:49,61:61,71:71,75:75,79:79}],52:[function(t,e,n){function i(t){p.open(t)}function r(e,n){var i=t(41);i.openIntent(e,n)}function o(t,e){if(f.isTwitterURL(t))if(g.get("eventsHub")&&e){var n=new s(c.generateId(),e);c.add(n),r(t,e),m.get("events").trigger("click",{target:e,region:"intent",type:"click",data:{}})}else i(t)}function s(t,e){this.id=t,this.element=this.srcEl=e}function a(t){this.srcEl=[],this.element=t}var c,u=t(13),l=t(49),d=t(79),h=t(71),f=t(75),p=t(25),m=t(21),g=t(20);a.prototype=new l,d.aug(a.prototype,{render:function(){return c=this,h.resolve(u.body)}}),a.open=o,e.exports=a},{13:13,20:20,21:21,25:25,41:41,49:49,71:71,75:75,79:79}],53:[function(t,e,n){function i(){s=r.VALID_COLOR.test(h.val("widgets:link-color"))&&RegExp.$1,c=r.VALID_COLOR.test(h.val("widgets:border-color"))&&RegExp.$1,a=h.val("widgets:theme")}function r(t){if(t){var e,n=this;this.readyDeferred=new A,this.renderedDeferred=new A,l.apply(this,[t]),e=this.params(),this.targetEl=this.srcEl&&this.srcEl.parentNode||e.targetEl||u.body,this.predefinedWidth=r.VALID_UNIT.test(e.width||this.attr("width"))&&RegExp.$1,this.layout(function(){return n.containerWidth=b.effectiveWidth(n.targetEl)}).then(function(t){var i=n.predefinedWidth||t||n.dimensions.DEFAULT_WIDTH;n.height=r.VALID_UNIT.test(e.height||n.attr("height"))&&RegExp.$1,n.width=Math.max(n.dimensions.MIN_WIDTH,Math.min(i,n.dimensions.DEFAULT_WIDTH))}),r.VALID_COLOR.test(e.linkColor||this.dataAttr("link-color"))?this.linkColor=RegExp.$1:this.linkColor=s,r.VALID_COLOR.test(e.borderColor||this.dataAttr("border-color"))?this.borderColor=RegExp.$1:this.borderColor=c,this.theme=e.theme||this.attr("data-theme")||a,this.theme=/(dark|light)/.test(this.theme)?this.theme:"",T.ie9()&&this.classAttr.push("ie9"),this.sandboxCreated=_.createSandbox({"class":this.renderedClassNames,id:this.id,allowfullscreen:""},{position:"absolute",visibility:"hidden"},function(t){n.modifyFrame&&(t=n.modifyFrame(t)),n.srcEl?n.targetEl.insertBefore(t,n.srcEl):n.targetEl.appendChild(t)},this.layout).then(function(t){n.setupSandbox(t),new g(t.element().contentWindow)}),this.rendered().then(function(t){n.applyVisibleSandboxStyles(t)})}}function o(t,e){return t+e}var s,a,c,u=t(13),l=t(49),d=t(52),h=t(19),f=t(46),p=t(38),m=t(35),g=t(85),v=t(8),y=t(10),w=t(9),b=t(12),_=t(32),E=t(57),A=t(70),T=t(62),x=t(71),I=t(75),S=t(76),D=t(79),N=t(72),C=[".timeline-header h1.summary",".timeline-header h1.summary a:link",".timeline-header h1.summary a:visited"];r.prototype=new l,D.aug(r.prototype,{dimensions:{},linkColorSelectors:[".customisable",".customisable:link",".customisable:visited"],linkStateColorSelectors:[".customisable:hover",".customisable:focus",".customisable:active",".customisable-highlight:hover",".customisable-highlight:focus","a:hover .customisable-highlight","a:focus .customisable-highlight"],bgColorSelectors:["a:hover .ic-mask","a:focus .ic-mask"],borderColorSelectors:[".customisable-border"],styleSheetUrl:function(){throw new Error("must set styleSheetUrl")},onStyleSheetLoad:function(){},setupSandbox:function(t){var e,n,i=this;this.sandbox=t,T.ios()&&v.add(this.sandbox.root,"env-ios"),T.touch()&&v.add(this.sandbox.root,"is-touch"),e=this.styleSheetUrl(this.lang,this.theme),n=this.onStyleSheetLoad.bind(this),N.some([i.applyInitialSandboxStyles(t),t.appendCss(".SandboxRoot { display:none }"),t.setBaseTarget("_blank"),t.appendStyleSheet(e,n)]).then(function(){i.readyDeferred.resolve(t)})},ready:function(){return this.readyDeferred.promise},rendered:function(){return this.renderedDeferred.promise},contentWidth:function(t){var e=this.dimensions,n=this.borderless?0:e.BORDERS,i=this.fullBleedPhoto?0:this.chromeless&&this.narrow?e.NARROW_MEDIA_PADDING_CL:this.chromeless?e.WIDE_MEDIA_PADDING_CL:this.narrow?e.NARROW_MEDIA_PADDING:e.WIDE_MEDIA_PADDING;return(t||this.width)-(i+n)},applyInitialSandboxStyles:function(t){var e=this;return t.style({border:"none",maxWidth:"100%",minWidth:e.dimensions.MIN_WIDTH+"px",margin:e.dimensions.MARGIN,padding:"0",display:"block",position:"absolute",visibility:"hidden"},!0)},applyVisibleSandboxStyles:function(t){return t.style({position:"static",visibility:"visible"})},addSiteStylesPrefix:function(t){return("dark"==this.theme?".thm-dark ":"")+t},addSiteStyles:function(){var t=[],e=this.addSiteStylesPrefix.bind(this);return this.headingStyle&&t.push(C.map(e).join(",")+"{"+this.headingStyle+"}"),this.linkColor&&(t.push(this.linkColorSelectors.map(e).join(",")+"{color:"+this.linkColor+"}"),t.push(this.bgColorSelectors.map(e).join(",")+"{background-color:"+this.linkColor+"}"),t.push(this.linkStateColorSelectors.map(e).join(",")+"{color:"+E.lighten(this.linkColor,.2)+"}")),this.borderColor&&t.push(this.borderColorSelectors.map(e).concat("dark"==this.theme?[".thm-dark.customisable-border"]:[]).join(",")+"{border-color:"+this.borderColor+"}"),t.length?this.sandbox.appendCss(t.join("")):void 0},setNarrow:function(){var t=this,e=this.narrow;return this.narrow=this.width<this.dimensions.NARROW_WIDTH,e!=this.narrow?this.layout(function(){v.toggle(t.sandbox.root,"env-narrow",t.narrow)}):x.resolve(this.narrow)},createScribeData:function(t){var e=D.aug({},this.baseScribeData(),{item_ids:[],item_details:this.extractTweetScribeDetails(t)});return D.forIn(e.item_details,function(t){e.item_ids.push(t)}),e},bindUIHandlers:function(){var t=this.element;w.delegate(t,"click",".MediaCard-dismissNsfw",function(){var e=y.closest(".MediaCard",this,t);v.remove(e,"is-nsfw")})},bindIntentHandlers:function(){function t(t){var i=y.closest(".tweet",this,n),r=e.createScribeData(i);p.interaction(t,r,!0)}var e=this,n=this.element;w.delegate(n,"click","A",t),w.delegate(n,"click","BUTTON",t),w.delegate(n,"click",".profile",function(){e.addUrlParams(this)}),w.delegate(n,"click",".follow-button",function(t){var n;t.altKey||t.metaKey||t.shiftKey||T.ios()||T.android()||S.asBoolean(this.getAttribute("data-age-gate"))||(n=I.intentForFollowURL(this.href,!0),n&&(d.open(n,e.sandbox.element()),w.preventDefault(t)))}),w.delegate(n,"click",".web-intent",function(t){e.addUrlParams(this),t.altKey||t.metaKey||t.shiftKey||(d.open(this.href,e.sandbox.element()),w.preventDefault(t))})},baseScribeData:function(){return{}},extractTweetScribeDetails:m,constrainMedia:function(t,e,n){return f.constrainMedia(t||this.element,e||this.contentWidth(),this.dimensions.maxHeight,n||this.layout)},collapseRegions:function(){var t=this;D.toRealArray(this.element.querySelectorAll(".collapsible-container")).forEach(function(e){var n,i,r=D.toRealArray(e.children),s=r.length&&e.offsetWidth,a=r.length&&r.map(function(t){return t.offsetWidth}),c=r.length;if(r.length)for(;c>0;){if(c--,n=a.reduce(o,0),!s||!n)return;if(s>n)return;i=r[c].getAttribute("data-collapsed-class"),i&&(v.add(t.element,i),a[c]=r[c].offsetWidth)}})}}),r.VALID_UNIT=/^([0-9]+)( ?px)?$/,r.VALID_COLOR=/^(#(?:[0-9a-f]{3}|[0-9a-f]{6}))$/i,i(),e.exports=r},{10:10,12:12,13:13,19:19,32:32,35:35,38:38,46:46,49:49,52:52,57:57,62:62,70:70,71:71,72:72,75:75,76:76,79:79,8:8,85:85,9:9}],54:[function(t,e,n){function i(t){if(t){var e,n,i,r,o,s,c,u;a.apply(this,[t]),e=this.params(),n=(e.chrome||this.dataAttr("chrome")||"").split(" "),this.preview=e.previewParams,this.widgetId=e.widgetId||this.dataAttr("widget-id"),this.instanceId=++B,this.cursors={maxPosition:0,minPosition:0},(r=e.screenName||this.dataAttr("screen-name"))||(o=e.userId||this.dataAttr("user-id"))?this.override={overrideType:"user",overrideId:o,overrideName:r,withReplies:y.asBoolean(e.showReplies||this.dataAttr("show-replies"))?"true":"false"}:(r=e.favoritesScreenName||this.dataAttr("favorites-screen-name"))||(o=e.favoritesUserId||this.dataAttr("favorites-user-id"))?this.override={overrideType:"favorites",overrideId:o,overrideName:r}:((r=e.listOwnerScreenName||this.dataAttr("list-owner-screen-name"))||(o=e.listOwnerId||this.dataAttr("list-owner-id")))&&((s=e.listId||this.dataAttr("list-id"))||(c=e.listSlug||this.dataAttr("list-slug")))?this.override={overrideType:"list",overrideOwnerId:o,overrideOwnerName:r,overrideId:s,overrideName:c}:(u=e.customTimelineId||this.dataAttr("custom-timeline-id"))?this.override={overrideType:"custom",overrideId:u}:this.override={},this.tweetLimit=y.asInt(e.tweetLimit||this.dataAttr("tweet-limit")),this.staticTimeline=this.tweetLimit>0,n.length&&(i=w.contains(n,"none"),this.chromeless=i||w.contains(n,"transparent"),this.headerless=i||w.contains(n,"noheader"),this.footerless=i||w.contains(n,"nofooter"),this.borderless=i||w.contains(n,"noborders"),this.noscrollbar=w.contains(n,"noscrollbar")),this.headingStyle=g.sanitize(e.headingStyle||this.dataAttr("heading-style"),void 0,!0),this.classAttr.push("twitter-timeline-rendered"),this.ariaPolite=e.ariaPolite||this.dataAttr("aria-polite")}}var r=t(16),o=t(3),s=t(49),a=t(53),c=t(7),u=t(2),l=t(26),d=t(44),h=t(46),f=t(34),p=t(36),m=t(47),g=t(58),v=t(62),y=t(76),w=t(79),b=t(9),_=t(8),E=t(10),A=t(61),T=t(59),x=t(21),I=t(20),S=t(37),D={CLIENT_SIDE_USER:0,
CLIENT_SIDE_APP:2},N=".timeline",C=".new-tweets-bar",P=".timeline-header",R=".timeline-footer",L=".stream",k=".h-feed",O=".tweet",M=".detail-expander",H=".expand",W=".permalink",U=".no-more-pane",j="expanded",q="pending-scroll-in",F="pending-new-tweet-display",z="pending-new-tweet",B=0;i.prototype=new a,w.aug(i.prototype,{renderedClassNames:"twitter-timeline twitter-timeline-rendered",dimensions:{DEFAULT_HEIGHT:"600",DEFAULT_WIDTH:"520",NARROW_WIDTH:"320",maxHeight:"375",MIN_WIDTH:"180",MIN_HEIGHT:"200",MARGIN:"0",WIDE_MEDIA_PADDING:81,NARROW_MEDIA_PADDING:16,WIDE_MEDIA_PADDING_CL:60,NARROW_MEDIA_PADDING_CL:12,BORDERS:2},styleSheetUrl:o.timeline,create:function(t){var e,n,i,r,o=this,s=this.sandbox.createElement("div"),a=[];return s.innerHTML=t.body,(e=s.children[0]||!1)?(this.reconfigure(t.config),this.discardStaticOverflow(e),this.sandbox.setTitle(e.getAttribute("data-iframe-title")||"Timeline"),h.retinize(e),this.constrainMedia(e),this.searchQuery=e.getAttribute("data-search-query"),this.profileId=e.getAttribute("data-profile-id"),this.timelineType=e.getAttribute("data-timeline-type"),this.collectionId=e.getAttribute("data-collection-id"),r=this.getTweetDetails(s.querySelector(k)),w.forIn(r,function(t){a.push(t)}),i=this.baseScribeData(),i.item_ids=a,i.item_details=r,this.collectionId&&(i.item_ids.push(this.collectionId),i.item_details[this.collectionId]={item_type:S.CUSTOM_TIMELINE}),this.timelineType&&p.clientEvent({page:this.timelineType+"_timeline",component:"timeline",element:"initial",action:a.length?"results":"no_results"},i,!0),p.clientEvent({page:"timeline",component:"timeline",element:"initial",action:a.length?"results":"no_results"},i,!0),f.scribeTimelineAudienceImpression(),p.flush(),"assertive"==this.ariaPolite&&(n=e.querySelector(C),n.setAttribute("aria-polite","assertive")),e.id=this.id,e.className+=" "+this.classAttr.join(" "),e.lang=this.lang,this.ready().then(function(t){t.appendChild(e).then(function(){o.renderedDeferred.resolve(o.sandbox)}),t.style({display:"inline-block"}),o.layout(function(){o.srcEl&&o.srcEl.parentNode&&o.srcEl.parentNode.removeChild(o.srcEl),o.predefinedWidth=o.width,o.predefinedHeight=o.height,o.width=t.width(o.width),o.height=t.height(o.height)}).then(function(){o.setNarrow(),o.sandbox.onresize(o.handleResize.bind(o)),o.completeDeferred.resolve(o.sandbox.element())})}),e):void 0},render:function(){var t=this;return this.preview||this.widgetId?(this.rendered().then(this.staticTimeline?function(t){t.resizeToContent(),s.doLayoutAsync()}:function(){t.recalculateStreamHeight(),s.doLayoutAsync()}),this.preview?this.getPreviewTimeline():this.getTimeline(),this.completed().then(this.scribePerformance.bind(this)),this.completed()):(this.completeDeferred.reject(400),this.completed())},scribePerformance:function(){l.endAndTrack("render","widgets-js-load","timeline",this.baseScribeData())},getPreviewTimeline:function(){function t(t){n.ready().then(function(){n.element=n.create(t),n.readTranslations(),n.bindInteractions(),n.updateCursors(t.headers,{initial:!0}),s.doLayoutAsync()})}function e(t){return t&&t.headers?void n.completeDeferred.reject(t.headers.status):void n.completeDeferred.resolve(n.srcEl)}var n=this;d.timelinePreview({params:this.preview}).then(t,e)},getTimeline:function(){function t(t){n.ready().then(function(){n.element=n.create(t),n.readTranslations(),n.bindInteractions(),n.updateTimeStamps(),n.updateCursors(t.headers,{initial:!0}),t.headers.xPolling&&/\d/.test(t.headers.xPolling)&&(n.pollInterval=1e3*t.headers.xPolling),n.staticTimeline||n.schedulePolling(),s.doLayoutAsync()})}function e(t){return t&&t.headers?void n.completeDeferred.reject(t.headers.status):void n.completeDeferred.resolve(n.srcEl)}var n=this;p.init(),d.timeline(w.aug({id:this.widgetId,instanceId:this.instanceId,dnt:A.enabled(),lang:this.lang},this.override)).then(t,e)},reconfigure:function(t){this.lang=t.lang,this.theme||(this.theme=t.theme),"dark"==this.theme&&this.classAttr.push("thm-dark"),this.chromeless&&this.classAttr.push("var-chromeless"),this.borderless&&this.classAttr.push("var-borderless"),this.headerless&&this.classAttr.push("var-headerless"),this.footerless&&this.classAttr.push("var-footerless"),this.staticTimeline&&this.classAttr.push("var-static"),!this.linkColor&&t.linkColor&&a.VALID_COLOR.test(t.linkColor)&&(this.linkColor=RegExp.$1),!this.height&&a.VALID_UNIT.test(t.height)&&(this.height=RegExp.$1),this.height=Math.max(this.dimensions.MIN_HEIGHT,this.height?this.height:this.dimensions.DEFAULT_HEIGHT),this.preview&&this.classAttr.push("var-preview"),this.narrow=this.width<=this.dimensions.NARROW_WIDTH,this.narrow&&_.add(this.sandbox.root,"env-narrow"),this.addSiteStyles()},getTweetDetails:function(t){var e,n=this,i={};return e=t&&t.children||[],w.toRealArray(e).forEach(function(t){w.aug(i,n.extractTweetScribeDetails(t))}),i},baseScribeData:function(){return{widget_id:this.widgetId,widget_origin:T.rootDocumentLocation(),widget_frame:T.isFramed()&&T.currentDocumentLocation(),message:this.partner,query:this.searchQuery,profile_id:this.profileId}},bindInteractions:function(){var t=this,e=this.element,n=!0;this.bindIntentHandlers(),this.bindUIHandlers(),b.delegate(e,"click",".load-tweets",function(e){n&&(n=!1,t.forceLoad(),b.stop(e))}),b.delegate(e,"click",".display-sensitive-image",function(n){t.showNSFW(E.closest(O,this,e)),b.stop(n)}),b.delegate(e,"mouseover",N,function(){t.mouseOver=!0}),b.delegate(e,"mouseout",N,function(){t.mouseOver=!1}),b.delegate(e,"mouseover",C,function(){t.mouseOverNotifier=!0}),b.delegate(e,"mouseout",C,function(){t.mouseOverNotifier=!1,r.setTimeout(function(){t.hideNewTweetNotifier()},3e3)}),this.staticTimeline||(b.delegate(e,"click",H,function(n){n.altKey||n.metaKey||n.shiftKey||(t.toggleExpando(E.closest(O,this,e)),b.stop(n))}),b.delegate(e,"click","A",function(t){b.stopPropagation(t)}),b.delegate(e,"click",".with-expansion",function(e){t.toggleExpando(this),b.stop(e)}),b.delegate(e,"click",".load-more",function(){t.loadMore()}),b.delegate(e,"click",C,function(){t.scrollToTop(),t.hideNewTweetNotifier(!0)}))},scrollToTop:function(){var t=this.element.querySelector(L);t.scrollTop=0,t.focus()},update:function(){var t=this,e=this.element.querySelector(k),n=e&&e.children[0],i=n&&n.getAttribute("data-tweet-id");this.updateTimeStamps(),this.requestTweets(i,!0,function(e){e.childNodes.length>0&&t.insertNewTweets(e)})},loadMore:function(){var t=this,e=w.toRealArray(this.element.querySelectorAll(O)).pop(),n=e&&e.getAttribute("data-tweet-id");this.requestTweets(n,!1,function(e){var i=t.element.querySelector(U),r=e.childNodes[0];return i.style.cssText="",r&&r.getAttribute("data-tweet-id")==n&&e.removeChild(r),e.childNodes.length>0?void t.appendTweets(e):(_.add(t.element,"no-more"),void i.focus())})},forceLoad:function(){var t=this,e=!!this.element.querySelectorAll(k).length;this.requestTweets(1,!0,function(n){n.childNodes.length&&(t[e?"insertNewTweets":"appendTweets"](n),_.add(t.element,"has-tweets"))})},schedulePolling:function(t){var e=this;null!==this.pollInterval&&(t=I.get("timeline.pollInterval")||t||this.pollInterval||1e4,t>-1&&r.setTimeout(function(){e.isUpdating||e.update(),e.schedulePolling()},t))},updateCursors:function(t,e){(e||{}).initial?(this.cursors.maxPosition=t.maxPosition,this.cursors.minPosition=t.minPosition):(e||{}).newer?this.cursors.maxPosition=t.maxPosition||this.cursors.maxPosition:this.cursors.minPosition=t.minPosition||this.cursors.minPosition},requestTweets:function(t,e,n){function i(t){if(o.isUpdating=!1,t&&t.headers){if("404"==t.headers.status)return void(o.pollInterval=null);if("503"==t.headers.status)return void(o.pollInterval*=1.5)}}function r(t){var i,r,s=o.sandbox.createDocumentFragment(),a=o.sandbox.createElement("ol"),c=[];if(o.isUpdating=!1,o.updateCursors(t.headers,{newer:e}),t&&t.headers&&t.headers.xPolling&&/\d+/.test(t.headers.xPolling)&&(o.pollInterval=1e3*t.headers.xPolling),t&&void 0!==t.body){if(a.innerHTML=t.body,a.children[0]&&"LI"!=a.children[0].tagName)return;for(r=o.getTweetDetails(a),w.forIn(r,function(t){c.push(t)}),c.length&&(i=o.baseScribeData(),i.item_ids=c,i.item_details=r,i.event_initiator=e?D.CLIENT_SIDE_APP:D.CLIENT_SIDE_USER,o.timelineType&&p.clientEvent({page:o.timelineType+"_timeline",component:"timeline",element:"initial",action:c.length?"results":"no_results"},i,!0),p.clientEvent({page:"timeline",component:"timeline",element:e?"newer":"older",action:"results"},i,!0),p.flush()),h.retinize(a),o.constrainMedia(a);a.children[0];)s.appendChild(a.children[0]);n(s)}}var o=this,s={id:this.widgetId,instanceId:this.instanceId,screenName:this.widgetScreenName,userId:this.widgetUserId,withReplies:this.widgetShowReplies,dnt:A.enabled(),lang:this.lang};e&&this.cursors.maxPosition?s.minPosition=this.cursors.maxPosition:!e&&this.cursors.minPosition?s.maxPosition=this.cursors.minPosition:e?s.sinceId=t:s.maxId=t,d.timelinePoll(w.aug(s,this.override)).then(r,i)},insertNewTweets:function(t){var e,n=this,i=this.element.querySelector(L),o=i.querySelector(k),s=o.offsetHeight;return o.insertBefore(t,o.firstChild),e=o.offsetHeight-s,x.get("events").trigger("timelineUpdated",{target:this.sandbox.element(),region:"newer"}),i.scrollTop>40||this.mouseIsOver()?(i.scrollTop=i.scrollTop+e,this.updateTimeStamps(),void this.showNewTweetNotifier()):(_.remove(this.element,q),o.style.cssText="margin-top: -"+e+"px",r.setTimeout(function(){i.scrollTop=0,_.add(n.element,q),v.cssTransitions()?o.style.cssText="":u.animate(function(t){e>t?o.style.cssText="margin-top: -"+(e-t)+"px":o.style.cssText=""},e,500,u.easeOut)},500),this.updateTimeStamps(),void("custom"!=this.timelineType&&this.gcTweets(50)))},appendTweets:function(t){var e=this.element.querySelector(k);e.appendChild(t),this.updateTimeStamps(),x.get("events").trigger("timelineUpdated",{target:this.sandbox.element(),region:"older"})},gcTweets:function(t){var e,n=this.element.querySelector(k),i=n.children.length;for(t=t||50;i>t&&(e=n.children[i-1]);i--)n.removeChild(e)},showNewTweetNotifier:function(){var t=this,e=this.element.querySelector(C),n=e.children[0];e.style.cssText="",e.removeChild(n),e.appendChild(n),_.add(this.element,F),r.setTimeout(function(){_.add(t.element,z)},10),this.newNoticeDisplayTime=+new Date,r.setTimeout(function(){t.hideNewTweetNotifier()},5e3)},hideNewTweetNotifier:function(t){var e=this;(t||!this.mouseOverNotifier)&&(_.remove(this.element,z),r.setTimeout(function(){_.remove(e.element,F)},500))},discardStaticOverflow:function(t){var e,n=t.querySelector(k);if(this.staticTimeline)for(this.height=0;e=n.children[this.tweetLimit];)n.removeChild(e)},hideStreamScrollBar:function(){var t,e=this.element.querySelector(L),n=this.element.querySelector(k);e.style.width="",t=this.element.offsetWidth-n.offsetWidth,t>0&&(e.style.width=this.element.offsetWidth+t+"px")},readTranslations:function(){var t=this.element,e="data-dt-";this.datetime=new c(w.compact({phrases:{now:t.getAttribute(e+"now"),s:t.getAttribute(e+"s"),m:t.getAttribute(e+"m"),h:t.getAttribute(e+"h"),second:t.getAttribute(e+"second"),seconds:t.getAttribute(e+"seconds"),minute:t.getAttribute(e+"minute"),minutes:t.getAttribute(e+"minutes"),hour:t.getAttribute(e+"hour"),hours:t.getAttribute(e+"hours")},months:t.getAttribute(e+"months").split("|"),formats:{abbr:t.getAttribute(e+"abbr"),shortdate:t.getAttribute(e+"short"),longdate:t.getAttribute(e+"long")}}))},updateTimeStamps:function(){for(var t,e,n,i,r=this.element.querySelectorAll(W),o=0;t=r[o];o++)n=t.getAttribute("data-datetime"),i=n&&this.datetime.timeAgo(n,this.i18n),e=t.getElementsByTagName("TIME")[0],i&&(e&&e.innerHTML?e.innerHTML=i:t.innerHTML=i)},mouseIsOver:function(){return this.mouseOver},addUrlParams:function(t){var e=this,n={tw_w:this.widgetId,related:this.related,partner:this.partner,query:this.searchQuery,profile_id:this.profileId,original_referer:T.rootDocumentLocation(),tw_p:"embeddedtimeline"};return this.addUrlParams=m(n,function(t){var n=E.closest(O,t,e.element);return n&&{tw_i:n.getAttribute("data-tweet-id")}}),this.addUrlParams(t)},showNSFW:function(t){var e,n,i,r,o,s,a=t.querySelector(".nsfw"),c=0;a&&(n=h.scaleDimensions(a.getAttribute("data-width"),a.getAttribute("data-height"),this.contentWidth(),a.getAttribute("data-height")),e=!!(r=a.getAttribute("data-player")),e?o=this.sandbox.createElement("iframe"):(o=this.sandbox.createElement("img"),r=a.getAttribute(v.retina()?"data-image-2x":"data-image"),o.alt=a.getAttribute("data-alt"),s=this.sandbox.createElement("a"),s.href=a.getAttribute("data-href"),s.appendChild(o)),o.title=a.getAttribute("data-title"),o.src=r,o.width=n.width,o.height=n.height,i=E.closest(M,a,t),c=n.height-a.offsetHeight,a.parentNode.replaceChild(e?o:s,a),i.style.cssText="height:"+(i.offsetHeight+c)+"px")},toggleExpando:function(t){var e,n=this,i=t.querySelector(M),r=i&&i.children[0],o=r&&r.getAttribute("data-expanded-media"),a=t.querySelector(H),c=a&&a.getElementsByTagName("B")[0],u=c&&(c.innerText||c.textContent);if(c){if(this.layout(function(){c.innerHTML=a.getAttribute("data-toggled-text"),a.setAttribute("data-toggled-text",u)}),_.present(t,j))return this.layout(function(){_.remove(t,j)}),i?(this.layout(function(){i.style.cssText="",r.innerHTML=""}),void s.doLayout()):void s.doLayout();o&&(e=this.sandbox.createElement("DIV"),e.innerHTML=o,h.retinize(e),this.layout(function(){r.appendChild(e),n.constrainMedia(e,null,function(t){t()})})),i&&this.layout(function(){i.style.maxHeight="500px"}),this.layout(function(){_.add(t,j)}),s.doLayout()}},recalculateStreamHeight:function(t){var e=this,n=this.element.querySelector(P),i=this.element.querySelector(R),r=this.element.querySelector(L);this.layout(function(){var o=n.offsetHeight+(i?i.offsetHeight:0),s=t||e.sandbox.height();r.style.cssText="height:"+(s-o-2)+"px",e.noscrollbar&&e.hideStreamScrollBar()})},handleResize:function(t,e){var n=this,i=Math.min(this.dimensions.DEFAULT_WIDTH,Math.max(this.dimensions.MIN_WIDTH,Math.min(this.predefinedWidth||this.dimensions.DEFAULT_WIDTH,t)));(i!=this.width||e!=this.height)&&(this.width=i,this.height=e,this.setNarrow(),this.constrainMedia(this.element,this.contentWidth(i)),this.staticTimeline?this.layout(function(){n.height=n.element.offsetHeight,n.sandbox.height(n.height),x.get("events").trigger("resize",{target:n.sandbox.element()})}):(this.recalculateStreamHeight(e),x.get("events").trigger("resize",{target:this.sandbox.element()})),s.doLayoutAsync())}}),e.exports=i},{10:10,16:16,2:2,20:20,21:21,26:26,3:3,34:34,36:36,37:37,44:44,46:46,47:47,49:49,53:53,58:58,59:59,61:61,62:62,7:7,76:76,79:79,8:8,9:9}],55:[function(t,e,n){function i(t){s.apply(this,[t]);var e=this.params(),n=e.count||this.dataAttr("count"),i=e.size||this.dataAttr("size"),r=u.getScreenNameFromPage(),o=""+(e.shareWithRetweet||this.dataAttr("share-with-retweet")||a.val("share-with-retweet"));this.classAttr.push("twitter-tweet-button"),"hashtag"==e.type||c.contains(this.classAttr,"twitter-hashtag-button")?(this.type="hashtag",this.classAttr.push("twitter-hashtag-button")):"mention"==e.type||c.contains(this.classAttr,"twitter-mention-button")?(this.type="mention",this.classAttr.push("twitter-mention-button")):this.classAttr.push("twitter-share-button"),this.text=e.text||this.dataAttr("text"),this.text&&/\+/.test(this.text)&&!/ /.test(this.text)&&(this.text=this.text.replace(/\+/g," ")),this.counturl=e.counturl||this.dataAttr("counturl"),this.searchlink=e.searchlink||this.dataAttr("searchlink"),this.button_hashtag=l.hashTag(e.button_hashtag||e.hashtag||this.dataAttr("button-hashtag"),!1),this.size="large"==i?"l":"m",this.align=e.align||this.dataAttr("align")||"",this.via=e.via||this.dataAttr("via"),this.hashtags=e.hashtags||this.dataAttr("hashtags"),this.screen_name=l.screenName(e.screen_name||e.screenName||this.dataAttr("button-screen-name")),this.url=e.url||this.dataAttr("url"),this.type?(this.count="none",this.shareWithRetweet="never",r&&(this.related=this.related?r+","+this.related:r)):(this.text=this.text||h,this.url=this.url||u.getCanonicalURL()||f,this.count=c.contains(p,n)?n:"horizontal",this.via=this.via||r,o&&c.contains(m,o)&&(this.shareWithRetweet=o.replace("-","_")))}var r=t(13),o=t(14),s=t(49),a=t(19),c=t(79),u=t(78),l=t(75),d=t(61),h=r.title,f=o.href,p=["vertical","horizontal","none"],m=["never","publisher-first","publisher-only","author-first","author-only"];i.prototype=new s,c.aug(i.prototype,{iframeSource:"widgets/tweet_button.55a4019ea66c5d005a6e6d9d41c5e068.{{lang}}.html",widgetUrlParams:function(){return c.compact({text:this.text,url:this.url,via:this.via,related:this.related,count:this.count,lang:this.lang,counturl:this.counturl,searchlink:this.searchlink,placeid:this.placeid,original_referer:o.href,id:this.id,size:this.size,type:this.type,screen_name:this.screen_name,share_with_retweet:this.shareWithRetweet,button_hashtag:this.button_hashtag,hashtags:this.hashtags,align:this.align,partner:this.partner,dnt:d.enabled(),_:+new Date})},render:function(){var t,e=this,n=this.makeIframeSource();return this.count&&this.classAttr.push("twitter-count-"+this.count),t=this.create(n,{title:"Twitter Tweet Button"}).then(function(t){return e.element=t})}}),e.exports=i},{13:13,14:14,19:19,49:49,61:61,75:75,78:78,79:79}],56:[function(t,e,n){function i(t,e,n,i){b[t]=b[t]||[],b[t].push({s:n,f:i,lang:e})}function r(t,e){var n={};n[t]={item_type:0},v.clientEvent({page:"video",component:"tweet",action:"results"},f.aug({},e,{item_ids:[t],item_details:n}),!0),g.scribeVideoAudienceImpression()}function o(t,e){var n={};n[t]={item_type:0},v.clientEvent({page:"video",component:"rawembedcode",action:"no_results"},{widget_origin:p.rootDocumentLocation(),widget_frame:p.isFramed()&&p.currentDocumentLocation(),message:e,item_ids:[t],item_details:n},!0),g.scribeVideoAudienceImpression()}function s(t){if(t){u.apply(this,[t]);var e=this.srcEl&&this.srcEl.getElementsByTagName("A"),n=e&&e[e.length-1],i=this.params();this.hideStatus="hidden"===(i.status||this.dataAttr("status")),this.tweetId=i.tweetId||n&&y.status(n.href)}}var a=t(3),c=t(49),u=t(53),l=t(7),d=t(71),h=t(72),f=t(79),p=t(59),m=t(44),g=t(34),v=t(36),y=t(75),w=t(13),b={},_=[];s.prototype=new u,f.aug(s.prototype,{renderedClassNames:"twitter-video twitter-video-rendered",videoPlayer:!0,dimensions:{DEFAULT_HEIGHT:"0",DEFAULT_WIDTH:"0",maxHeight:"500",MIN_WIDTH:"320",MIN_HEIGHT:"180",MARGIN:"10px 0",WIDE_MEDIA_PADDING:0,NARROW_MEDIA_PADDING:0,BORDERS:0},styleSheetUrl:a.video,applyVisibleSandboxStyles:function(t){return t.style({visibility:"visible"})},applyInitialSandboxStyles:function(t){return t.style({position:"absolute",top:0,left:0,width:"100%",height:"100%",visiblity:"hidden"})},modifyFrame:function(t){return this.constrainingWrapper=w.createElement("div"),this.constrainingWrapper.style.minWidth=this.dimensions.MIN_WIDTH+"px",this.constrainingWrapper.style.margin=this.dimensions.MARGIN,this.wrapper=w.createElement("div"),this.wrapper.style.position="relative",this.wrapper.style.height=0,this.constrainingWrapper.appendChild(this.wrapper),this.wrapper.appendChild(t),this.constrainingWrapper},create:function(t){var e,n,i=this,o=this.sandbox.createElement("div");if(o.innerHTML=t,e=o.children[0]){n=e.children[0],this.playerConfig=JSON.parse(e.getAttribute("data-player-config")),this.sandbox.setTitle(e.getAttribute("data-iframe-title")||"Video"),this.sandbox.appendChild(e).then(function(){i.renderedDeferred.resolve(i.sandbox),i.completeDeferred.resolve(i.sandbox.element())});var s=n.getAttribute("data-width"),a=n.getAttribute("data-height"),c=s/a,u=1/c*100+"%";return this.layout(function(){i.wrapper.style.paddingBottom=u,i.constrainingWrapper.style.maxWidth=parseInt(i.dimensions.maxHeight,10)*c+"px"}),r(this.tweetId,this.baseScribeData()),e}},render:function(){var t=this;return this.tweetId?(this.rendered().then(function(){var e=t.srcEl;e&&e.parentNode&&t.layout(function(){e.parentNode.removeChild(e)})}),i(this.tweetId,this.lang,function(e){t.ready().then(function(){t.element=t.create(e),t.readTimestampTranslations(),t.writePlayerConfig()})},function(){o(t.tweetId,t.partner),t.completeDeferred.resolve(t.srcEl)}),_.push(this.completed()),this.completed()):(this.completeDeferred.resolve(this.srcEl),this.completed())},baseScribeData:function(){return{widget_origin:p.rootDocumentLocation(),widget_frame:p.isFramed()&&p.currentDocumentLocation(),message:this.partner}},readTimestampTranslations:function(){var t=this.element,e="data-dt-",n=t.getAttribute(e+"months")||"";this.datetime=new l(f.compact({phrases:{AM:t.getAttribute(e+"am"),PM:t.getAttribute(e+"pm")},months:n.split("|"),formats:{full:t.getAttribute(e+"full")}}))},getTimestamp:function(){var t=this.element.getAttribute("data-datetime"),e=t&&this.datetime.localTimeStamp(t);return{local:e}},writePlayerConfig:function(){this.playerConfig.statusTimestamp=this.getTimestamp(),this.playerConfig.hideStatus=this.hideStatus,this.element.setAttribute("data-player-config",JSON.stringify(this.playerConfig))}}),s.fetchAndRender=function(){function t(t){f.forIn(t,function(t,n){var i=e[t];i.forEach(function(t){t.s&&t.s.call(this,n)}),delete e[t]}),f.forIn(e,function(t,e){e.forEach(function(e){e.f&&e.f.call(this,t)})})}var e=b,n=[];b={};for(var i in e)e.hasOwnProperty(i)&&n.push(i);n.length&&(h.always(m.videos({ids:n.sort(),lang:e[n[0]][0].lang}),t),d.all(_),_=[])},c.afterLoad(s.fetchAndRender),e.exports=s},{13:13,3:3,34:34,36:36,44:44,49:49,53:53,59:59,7:7,71:71,72:72,75:75,79:79}],57:[function(t,e,n){function i(t){return c.parseInt(t,16)}function r(t){return u.isType("string",t)?(t=t.replace(l,""),t+=3===t.length?t:""):null}function o(t,e){var n,o,s,a;return t=r(t),e=e||0,t?(n=0>e?0:255,e=0>e?-Math.max(e,-1):Math.min(e,1),o=i(t.substring(0,2)),s=i(t.substring(2,4)),a=i(t.substring(4,6)),"#"+(16777216+65536*(Math.round((n-o)*e)+o)+256*(Math.round((n-s)*e)+s)+(Math.round((n-a)*e)+a)).toString(16).slice(1)):void 0}function s(t,e){return o(t,-e)}function a(t,e){return o(t,e)}var c=t(16),u=t(79),l=/^#/;e.exports={darken:s,lighten:a}},{16:16,79:79}],58:[function(t,e,n){e.exports={sanitize:function(t,e,n){var i,r=/^[\w ,%\/"'\-_#]+$/,o=t&&t.split(";").map(function(t){return t.split(":").slice(0,2).map(function(t){return t.trim()})}),s=0,a=[],c=n?"!important":"";for(e=e||/^(font|text\-|letter\-|color|line\-)[\w\-]*$/;o&&(i=o[s]);s++)i[0].match(e)&&i[1].match(r)&&a.push(i.join(":")+c);return a.join(";")}}},{}],59:[function(t,e,n){function i(t){return t&&c.isType("string",t)&&(u=t),u}function r(){return l}function o(){return u!==l}var s=t(14),a=t(78),c=t(79),u=a.getCanonicalURL()||s.href,l=u;e.exports={isFramed:o,rootDocumentLocation:i,currentDocumentLocation:r}},{14:14,78:78,79:79}],60:[function(t,e,n){function i(){u=1;for(var t=0,e=l.length;e>t;t++)l[t]()}var r,o,s,a=t(13),c=t(16),u=0,l=[],d=!1,h=a.createElement("a");/^loade|c/.test(a.readyState)&&(u=1),a.addEventListener&&a.addEventListener("DOMContentLoaded",o=function(){a.removeEventListener("DOMContentLoaded",o,d),i()},d),h.doScroll&&a.attachEvent("onreadystatechange",r=function(){/^c/.test(a.readyState)&&(a.detachEvent("onreadystatechange",r),i())}),s=h.doScroll?function(t){c.self!=c.top?u?t():l.push(t):!function(){try{h.doScroll("left")}catch(e){return setTimeout(function(){s(t)},50)}t()}()}:function(t){u?t():l.push(t)},e.exports=s},{13:13,16:16}],61:[function(t,e,n){function i(){h=!0}function r(t,e){return h?!0:l.asBoolean(d.val("dnt"))?!0:!a||1!=a.doNotTrack&&1!=a.msDoNotTrack?u.isUrlSensitive(e||s.host)?!0:c.isFramed()&&u.isUrlSensitive(c.rootDocumentLocation())?!0:(t=f.test(t||o.referrer)&&RegExp.$1,t&&u.isUrlSensitive(t)?!0:!1):!0}var o=t(13),s=t(14),a=t(15),c=t(59),u=t(74),l=t(76),d=t(19),h=!1,f=/https?:\/\/([^\/]+).*/i;e.exports={setOn:i,enabled:r}},{13:13,14:14,15:15,19:19,59:59,74:74,76:76}],62:[function(t,e,n){function i(t){return t=t||g,t.devicePixelRatio?t.devicePixelRatio>=1.5:t.matchMedia?t.matchMedia("only screen and (min-resolution: 144dpi)").matches:!1}function r(t){return t=t||A,/(Trident|MSIE \d)/.test(t)}function o(t){return t=t||A,/MSIE 9/.test(t)}function s(t){return t=t||A,/(iPad|iPhone|iPod)/.test(t)}function a(t){return t=t||A,/^Mozilla\/5\.0 \(Linux; (U; )?Android/.test(t)}function c(){return T}function u(t,e){return t=t||g,e=e||A,t.postMessage&&!(r(e)&&t.opener)}function l(t){t=t||m;try{return!!t.plugins["Shockwave Flash"]||!!new ActiveXObject("ShockwaveFlash.ShockwaveFlash")}catch(e){return!1}}function d(t,e,n){return t=t||g,e=e||m,n=n||A,"ontouchstart"in t||/Opera Mini/.test(n)||e.msMaxTouchPoints>0}function h(){var t=p.body.style;return void 0!==t.transition||void 0!==t.webkitTransition||void 0!==t.mozTransition||void 0!==t.oTransition||void 0!==t.msTransition}function f(){return!!(g.Promise&&g.Promise.resolve&&g.Promise.reject&&g.Promise.all&&g.Promise.race&&function(){var t;return new g.Promise(function(e){t=e}),b.isType("function",t)}())}var p=t(13),m=t(15),g=t(16),v=t(60),y=t(67),w=t(76),b=t(79),_=t(19),E=t(20),A=m.userAgent,T=!1,x=!1,I="twitter-csp-test";E.set("verifyCSP",function(t){var e=p.getElementById(I);x=!0,T=!!t,e&&e.parentNode.removeChild(e)}),v(function(){var t;return w.asBoolean(_.val("widgets:csp"))?T=!0:(t=p.createElement("script"),t.id=I,t.text=E.fullPath("verifyCSP")+"(false);",p.body.appendChild(t),void g.setTimeout(function(){x||(y.warn('TWITTER: Content Security Policy restrictions may be applied to your site. Add <meta name="twitter:widgets:csp" content="on"> to supress this warning.'),y.warn("TWITTER: Please note: Not all embedded timeline and embedded Tweet functionality is supported when CSP is applied."))},5e3))}),e.exports={retina:i,anyIE:r,ie9:o,ios:s,android:a,cspEnabled:c,flashEnabled:l,canPostMessage:u,touch:d,cssTransitions:h,hasPromiseSupport:f}},{13:13,15:15,16:16,19:19,20:20,60:60,67:67,76:76,79:79}],63:[function(t,e,n){var i=t(79),r={bind:function(t,e){return this._handlers=this._handlers||{},this._handlers[t]=this._handlers[t]||[],this._handlers[t].push(e)},unbind:function(t,e){if(this._handlers[t])if(e){var n=this._handlers[t].indexOf(e);n>=0&&this._handlers[t].splice(n,1)}else this._handlers[t]=[]},trigger:function(t,e){var n=this._handlers&&this._handlers[t];e=e||{},e.type=t,n&&n.forEach(function(t){i.async(t.bind(this,e))})}};e.exports={Emitter:r}},{79:79}],64:[function(t,e,n){function i(t){for(var e,n=r.getElementsByTagName("iframe"),i=0;e=n[i];i++)if(e.contentWindow===t)return e}var r=t(13);e.exports=i},{13:13}],65:[function(t,e,n){var i=t(13),r=t(79);e.exports=function(t,e,n){var o;if(n=n||i,t=t||{},e=e||{},t.name){try{o=n.createElement('<iframe name="'+t.name+'"></iframe>')}catch(s){o=n.createElement("iframe"),o.name=t.name}delete t.name}else o=n.createElement("iframe");return t.id&&(o.id=t.id,delete t.id),o.allowtransparency="true",o.scrolling="no",o.setAttribute("frameBorder",0),o.setAttribute("allowTransparency",!0),r.forIn(t,function(t,e){o.setAttribute(t,e)}),r.forIn(e,function(t,e){o.style[t]=e}),o}},{13:13,79:79}],66:[function(t,e,n){function i(){}var r,o=t(16),s=t(70),a=[];i.prototype.enqueue=function(t,e){var n=new s;return a.push({action:t,deferred:n,note:e}),n.promise},i.prototype.exec=function(){var t,e=a;if(e.length)for(a=[];e.length;)t=e.shift(),t&&t.action?t.deferred.resolve(t.action()):t.deferred.reject()},i.prototype.delayedExec=function(){r&&o.clearTimeout(r),r=o.setTimeout(this.exec,100)},e.exports=i},{16:16,70:70}],67:[function(t,e,n){function i(){u("info",h.toRealArray(arguments))}function r(){u("warn",h.toRealArray(arguments))}function o(){u("error",h.toRealArray(arguments))}function s(t){m&&(p[t]=c())}function a(t){var e;m&&(p[t]?(e=c(),i("_twitter",t,e-p[t])):o("timeEnd() called before time() for id: ",t))}function c(){return d.performance&&+d.performance.now()||+new Date}function u(t,e){if(d[f]&&d[f][t])switch(e.length){case 1:d[f][t](e[0]);break;case 2:d[f][t](e[0],e[1]);break;case 3:d[f][t](e[0],e[1],e[2]);break;case 4:d[f][t](e[0],e[1],e[2],e[3]);break;case 5:d[f][t](e[0],e[1],e[2],e[3],e[4]);break;default:0!==e.length&&d[f].warn&&d[f].warn("too many params passed to logger."+t)}}var l=t(14),d=t(16),h=t(79),f=["con","sole"].join(""),p={},m=h.contains(l.href,"tw_debug=true");e.exports={info:i,warn:r,error:o,time:s,timeEnd:a}},{14:14,16:16,79:79}],68:[function(t,e,n){function i(t){return function(e){return o.hasValue(e[t])}}function r(){this.assertions=[],this._defaults={}}var o=t(76),s=t(79);r.prototype.assert=function(t,e){return this.assertions.push({fn:t,msg:e||"assertion failed"}),this},r.prototype.defaults=function(t){return this._defaults=t||this._defaults,this},r.prototype.require=function(t){var e=this;return t=Array.isArray(t)?t:s.toRealArray(arguments),t.forEach(function(t){e.assert(i(t),"required: "+t)}),this},r.prototype.parse=function(t){var e,n;if(e=s.aug({},this._defaults,t||{}),n=this.assertions.reduce(function(t,n){return n.fn(e)||t.push(n.msg),t},[]),n.length>0)throw new Error(n.join("\n"));return e},e.exports=r},{76:76,79:79}],69:[function(t,e,n){var i,r,o,s=t(73);i=function(t){var e=t.search.substr(1);return s.decode(e)},r=function(t){var e=t.href,n=e.indexOf("#"),i=0>n?"":e.substring(n+1);return s.decode(i)},o=function(t){var e,n={},o=i(t),s=r(t);for(e in o)o.hasOwnProperty(e)&&(n[e]=o[e]);for(e in s)s.hasOwnProperty(e)&&(n[e]=s[e]);return n},e.exports={combined:o,fromQuery:i,fromFragment:r}},{73:73}],70:[function(t,e,n){function i(){var t=this;this.promise=new r(function(e,n){t.resolve=e,t.reject=n})}var r=t(71);e.exports=i},{71:71}],71:[function(t,e,n){var i=t(1).Promise,r=t(16),o=t(62);e.exports=o.hasPromiseSupport()?r.Promise:i},{1:1,16:16,62:62}],72:[function(t,e,n){function i(t,e){return t.then(e,e)}function r(t){var e;return t=t||[],e=t.length,t=t.filter(o),e?e!==t.length?s.reject("non-Promise passed to .some"):new s(function(e,n){function i(){r+=1,r===t.length&&n()}var r=0;t.forEach(function(t){t.then(e,i)})}):s.reject("no promises passed to .some")}function o(t){return t instanceof s}var s=t(71);e.exports={always:i,some:r,isPromise:o}},{71:71}],73:[function(t,e,n){function i(t){return encodeURIComponent(t).replace(/\+/g,"%2B").replace(/'/g,"%27")}function r(t){return decodeURIComponent(t)}function o(t){var e=[];return l.forIn(t,function(t,n){var r=i(t);l.isType("array",n)||(n=[n]),n.forEach(function(t){u.hasValue(t)&&e.push(r+"="+i(t))})}),e.sort().join("&")}function s(t){var e,n={};return t?(e=t.split("&"),e.forEach(function(t){var e=t.split("="),i=r(e[0]),o=r(e[1]);return 2==e.length?l.isType("array",n[i])?void n[i].push(o):i in n?(n[i]=[n[i]],void n[i].push(o)):void(n[i]=o):void 0}),n):{}}function a(t,e){var n=o(e);return n.length>0?l.contains(t,"?")?t+"&"+o(e):t+"?"+o(e):t}function c(t){var e=t&&t.split("?");return 2==e.length?s(e[1]):{}}var u=t(76),l=t(79);e.exports={url:a,decodeURL:c,decode:s,encode:o,encodePart:i,decodePart:r}},{76:76,79:79}],74:[function(t,e,n){function i(t){return t in a?a[t]:a[t]=s.test(t)}function r(){return i(o.host)}var o=t(14),s=/^[^#?]*\.(gov|mil)(:\d+)?([#?].*)?$/i,a={};e.exports={isUrlSensitive:i,isHostPageSensitive:r}},{14:14}],75:[function(t,e,n){function i(t){return"string"==typeof t&&m.test(t)&&RegExp.$1.length<=20}function r(t){return i(t)?RegExp.$1:void 0}function o(t,e){var n=p.decodeURL(t);return e=e||!1,n.screen_name=r(t),n.screen_name?p.url("https://twitter.com/intent/"+(e?"follow":"user"),n):void 0}function s(t){return o(t,!0)}function a(t){return"string"==typeof t&&w.test(t)}function c(t,e){return e=void 0===e?!0:e,a(t)?(e?"#":"")+RegExp.$1:void 0}function u(t){return"string"==typeof t&&g.test(t)}function l(t){return u(t)&&RegExp.$1}function d(t){return v.test(t)}function h(t){return y.test(t)}function f(t){return b.test(t)}var p=t(73),m=/(?:^|(?:https?\:)?\/\/(?:www\.)?twitter\.com(?:\:\d+)?(?:\/intent\/(?:follow|user)\/?\?screen_name=|(?:\/#!)?\/))@?([\w]+)(?:\?|&|$)/i,g=/(?:^|(?:https?\:)?\/\/(?:www\.)?twitter\.com(?:\:\d+)?\/(?:#!\/)?[\w_]+\/status(?:es)?\/)(\d+)/i,v=/^http(s?):\/\/(\w+\.)*twitter\.com([\:\/]|$)/i,y=/^http(s?):\/\/pbs\.twimg\.com\//,w=/^#?([^.,<>!\s\/#\-\(\)\'\"]+)$/,b=/twitter\.com(\:\d{2,4})?\/intent\/(\w+)/;e.exports={isHashTag:a,hashTag:c,isScreenName:i,screenName:r,
isStatus:u,status:l,intentForProfileURL:o,intentForFollowURL:s,isTwitterURL:d,isTwimgURL:h,isIntentURL:f,regexen:{profile:m}}},{73:73}],76:[function(t,e,n){function i(t){return void 0!==t&&null!==t&&""!==t}function r(t){return s(t)&&t%1===0}function o(t){return s(t)&&!r(t)}function s(t){return i(t)&&!isNaN(t)}function a(t){return i(t)&&"array"==p.toType(t)}function c(t){return p.contains(g,t)}function u(t){return p.contains(m,t)}function l(t){return i(t)?u(t)?!0:c(t)?!1:!!t:!1}function d(t){return s(t)?t:void 0}function h(t){return o(t)?t:void 0}function f(t){return r(t)?t:void 0}var p=t(79),m=[!0,1,"1","on","ON","true","TRUE","yes","YES"],g=[!1,0,"0","off","OFF","false","FALSE","no","NO"];e.exports={hasValue:i,isInt:r,isFloat:o,isNumber:s,isArray:a,isTruthValue:u,isFalseValue:c,asInt:f,asFloat:h,asNumber:d,asBoolean:l}},{79:79}],77:[function(t,e,n){function i(){return String(+new Date)+Math.floor(1e5*Math.random())+r++}var r=0;e.exports={generate:i}},{}],78:[function(t,e,n){function i(t,e){var n,i;return e=e||a,/^https?:\/\//.test(t)?t:/^\/\//.test(t)?e.protocol+t:(n=e.host+(e.port.length?":"+e.port:""),0!==t.indexOf("/")&&(i=e.pathname.split("/"),i.pop(),i.push(t),t="/"+i.join("/")),[e.protocol,"//",n,t].join(""))}function r(){for(var t,e=s.getElementsByTagName("link"),n=0;t=e[n];n++)if("canonical"==t.rel)return i(t.href)}function o(){for(var t,e,n,i=s.getElementsByTagName("a"),r=s.getElementsByTagName("link"),o=[i,r],a=0,u=0,l=/\bme\b/;t=o[a];a++)for(u=0;e=t[u];u++)if(l.test(e.rel)&&(n=c.screenName(e.href)))return n}var s=t(13),a=t(14),c=t(75);e.exports={absolutize:i,getCanonicalURL:r,getScreenNameFromPage:o}},{13:13,14:14,75:75}],79:[function(t,e,n){function i(t){return d(arguments).slice(1).forEach(function(e){o(e,function(e,n){t[e]=n})}),t}function r(t){return o(t,function(e,n){c(n)&&(r(n),u(n)&&delete t[e]),(void 0===n||null===n||""===n)&&delete t[e]}),t}function o(t,e){for(var n in t)(!t.hasOwnProperty||t.hasOwnProperty(n))&&e(n,t[n]);return t}function s(t){return{}.toString.call(t).match(/\s([a-zA-Z]+)/)[1].toLowerCase()}function a(t,e){return t==s(e)}function c(t){return t===Object(t)}function u(t){if(!c(t))return!1;if(Object.keys)return!Object.keys(t).length;for(var e in t)if(t.hasOwnProperty(e))return!1;return!0}function l(t,e){f.setTimeout(function(){t.call(e||null)},0)}function d(t){return Array.prototype.slice.call(t)}function h(t,e){return t&&t.indexOf?t.indexOf(e)>-1:!1}var f=t(16);e.exports={aug:i,async:l,compact:r,contains:h,forIn:o,isObject:c,isEmptyObject:u,toType:s,isType:a,toRealArray:d}},{16:16}],80:[function(t,e,n){function i(){if(o)return o;if(u.isDynamicWidget()){var t,e=0,n=c.parent.frames.length;try{if(o=c.parent.frames[h])return o}catch(i){}if(l.anyIE())for(;n>e;e++)try{if(t=c.parent.frames[e],t&&"function"==typeof t.openIntent)return o=t}catch(i){}}}function r(){var t,e,n,o,a,l,d={};if("function"===(typeof arguments[0]).toLowerCase()?d.success=arguments[0]:d=arguments[0],t=d.success||function(){},e=d.timeout||function(){},n=d.nohub||function(){},o=d.complete||function(){},a=void 0!==d.attempt?d.attempt:m,!u.isDynamicWidget()||s)return n(),o(),!1;l=i(),a--;try{if(l&&l.trigger)return t(l),void o()}catch(h){}return 0>=a?(s=!0,e(),void o()):+new Date-f>p*m?(s=!0,void n()):void c.setTimeout(function(){r({success:t,timeout:e,nohub:n,attempt:a,complete:o})},p)}var o,s,a=t(14),c=t(16),u=t(45),l=t(62),d="twttrHubFrameSecure",h="http:"==a.protocol?"twttrHubFrame":d,f=+new Date,p=100,m=20;e.exports={withHub:r,contextualHubId:h,secureHubId:d}},{14:14,16:16,45:45,62:62}],81:[function(t,e,n){e.exports={version:"86e7da0909e9ac95c583604466357eaa29354a5e:1435181106333"}},{}],82:[function(t,e,n){e.exports={css:"bdd2a0d299634c64db074e7c7b24c394"}},{}],83:[function(t,e,n){function i(t){t=r.parse(t),this.rootEl=t.rootEl,this.videoEl=t.videoEl,this.playButtonEl=t.playButtonEl,this.fallbackUrl=t.fallbackUrl,this.player=new u({videoEl:this.videoEl,loop:!0,autoplay:!1}),this._attachClickListener()}var r,o=t(8),s=t(9),a=t(16),c=t(68),u=t(84);r=(new c).require("rootEl","videoEl","playButtonEl").defaults({fallbackUrl:null}),i.prototype._attachClickListener=function(){function t(t){s.stopPropagation(t),e._togglePlayer()}var e=this;this.videoEl.addEventListener("click",t,!1),this.playButtonEl.addEventListener("click",t,!1)},i.prototype._togglePlayer=function(){return this.player.hasPlayableSource()?(this.player.toggle(),void o.toggle(this.rootEl,"is-playing",!this.player.isPaused())):void(this.fallbackUrl&&a.open(this.fallbackUrl))},e.exports=i},{16:16,68:68,8:8,84:84,9:9}],84:[function(t,e,n){function i(t){var e;t=r.parse(t),this.videoEl=t.videoEl,"loop"in t&&(this.videoEl.loop=t.loop),"autoplay"in t&&(this.videoEl.autoplay=t.autoplay),"poster"in t&&(this.videoEl.poster=t.poster),e=a.toRealArray(this.videoEl.querySelectorAll("source")),this.sourceTypes=e.map(function(t){return t.type})}var r,o=t(13),s=t(68),a=t(79);r=(new s).require("videoEl"),i.prototype.isPaused=function(){return this.videoEl.paused},i.prototype.play=function(){return this.videoEl.play(),this},i.prototype.pause=function(){return this.videoEl.pause(),this},i.prototype.toggle=function(){return this.videoEl.paused?this.play():this.pause()},i.prototype.addSource=function(t,e){var n=o.createElement("source");return n.src=t,n.type=e,this.sourceTypes.push(e),this.videoEl.appendChild(n),this},i.prototype.hasPlayableSource=function(){var t=this.videoEl;return t.canPlayType?this.sourceTypes.reduce(function(e,n){return e||!!t.canPlayType(n).replace("no","")},!1):!1},i.prototype.setDimensions=function(t,e){return this.videoEl.width=t,this.videoEl.height=e,this},e.exports=i},{13:13,68:68,79:79}],85:[function(t,e,n){function i(t,e){return t&&t.getAttribute?t.getAttribute("data-"+e):void 0}function r(t,e){return{element:t.element||v,action:t.action||y,page:o(e)?"video":void 0}}function o(t){return d.closest(".embedded-video",t)}function s(t){var e=d.closest(".tweet",t),n=!e&&d.closest(".EmbeddedTweet",t);return n&&(e=n.querySelector(".tweet.subject")),e}function a(t){return JSON.parse(i(o(t),"player-config"))}function c(t,e){var n,r,a,c=o(e);return c?n=l.aug({item_type:m,card_type:g,id:i(c,"tweet-id"),card_name:i(c,"card-name"),publisher_id:i(c,"publisher-id"),content_id:i(c,"content-id")},t.itemData||{}):(r=d.closest(".cards-multimedia",e),a=s(e),n=l.aug({item_type:m,card_type:g,id:i(a,"tweet-id"),card_name:i(r,"card-name"),publisher_id:i(r,"publisher-id"),content_id:i(r,"video-content-id")},t.itemData||{})),{items:[n]}}function u(t){var e=this;this.global=t,this.server=(new h).attachReceiver(new p.Receiver(t,"")).bind("scribe",function(t){e.scribe(t,this)}).bind("requestPlayerConfig",function(){return e.requestPlayerConfig(this)})}var l=t(79),d=t(10),h=t(29),f=t(38),p=t(30),m=0,g=6,v="amplify_player",y="undefined";u.prototype.findIframeByWindow=function(t){for(var e=this.global.document.getElementsByTagName("iframe"),n=e.length,i=0;n>i;i++)if(e[i].contentWindow==t)return e[i]},u.prototype.requestPlayerConfig=function(t){var e=this.findIframeByWindow(t);if(e)return a(e)},u.prototype.scribe=function(t,e){var n,i,o,s;n=t&&t.customScribe,i=this.findIframeByWindow(e),n&&i&&(o=r(n,i),s=c(n,i),f.clientEvent2(o,s,!0))},e.exports=u},{10:10,29:29,30:30,38:38,79:79}],86:[function(t,e,n){!function(){var e=t(13),n=t(42),i=t(60),r=t(67),o=t(26),s=t(49),a=t(51),c=t(55),u=t(50),l=t(54),d=t(56),h=t(52),f=t(40),p=t(63),m=t(41),g=t(24),v=t(21),y=t(20),w=t(17),b=t(70),_=t(48);if(y.init("host","platform.twitter.com"),o.start("widgets-js-load"),n.requestArticleUrl(),_(function(t,e,n){var i=t&&s.findInstance(t);i&&i.setInitialSize(e,n)}),y.get("widgets.loaded"))return v.call("widgets.load"),!1;if(y.get("widgets.init"))return!1;y.set("widgets.init",!0),v.set("init",!0);var E=new b;w.exposeReadyPromise(E.promise,v.base,"_e"),v.set("events",{bind:function(t,e){E.promise.then(function(n){n.events.bind(t,e)})}}),i(function(){function t(){y.set("eventsHub",m.init()),m.init(!0)}var n,i={"a.twitter-share-button":c,"a.twitter-mention-button":c,"a.twitter-hashtag-button":c,"a.twitter-follow-button":a,"blockquote.twitter-tweet":u,"a.twitter-timeline":l,"div.twitter-timeline":l,"blockquote.twitter-video":d,body:h},o=y.get("eventsHub")?v.get("events"):{};v.aug("widgets",f,{load:function(t){r.time("load"),s.init(i),s.embed(t),y.set("widgets.loaded",!0)}}),v.aug("events",o,p.Emitter),n=v.get("events.bind"),v.set("events.bind",function(e,i){t(),this.bind=n,this.bind(e,i)}),E.resolve(v.base),g.attachTo(e),v.call("widgets.load")})}()},{13:13,17:17,20:20,21:21,24:24,26:26,40:40,41:41,42:42,48:48,49:49,50:50,51:51,52:52,54:54,55:55,56:56,60:60,63:63,67:67,70:70}],87:[function(t,e,n){function i(){}var r=t(79),o=t(63);r.aug(i.prototype,o.Emitter,{transportMethod:"",init:function(){},send:function(t){var e;this._ready?this._performSend(t):e=this.bind("ready",function(){this.unbind("ready",e),this._performSend(t)})},ready:function(){this.trigger("ready",this),this._ready=!0},isReady:function(){return!!this._ready},receive:function(t){this.trigger("message",t)}}),e.exports={Connection:i}},{63:63,79:79}],88:[function(t,e,n){function i(t,e){var n=e||Math.floor(100*Math.random()),i=['<object id="xdflashshim'+n+'" name="xdflashshim'+n+'"','type="application/x-shockwave-flash" classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000"','width="1" height="1" style="position:absolute;left:-9999px;top:-9999px;">','<param name="movie" value="'+t+"&debug="+r.__XDDEBUG__+'">','<param name="wmode" value="window">','<param name="allowscriptaccess" value="always">',"</object>"].join(" ");return i}var r=t(16);e.exports={object:i}},{16:16}],89:[function(t,e,n){function i(t){return(JSON.parse||JSON.decode)(t)}function r(t){this.con=t}function o(){this.id=o.id++}var s=t(79),a=t(63);s.aug(r.prototype,{expose:function(t){this.con.bind("message",this._handleRequest(t))},call:function(t){var e,n=this;return this._requests||(this._requests={},this.con.bind("message",function(t){var e;try{t=i(t)}catch(r){return}t.callback&&"number"==typeof t.id&&(e=n._requests[t.id])&&(t.error?e.trigger("error",t):e.trigger("success",t),delete n._requests[t.id])})),e=new o,this._requests[e.id]=e,e.send(this.con,t,Array.prototype.slice.call(arguments,1))},_handleRequest:function(t){var e=this;return function(n){var r,o;try{n=i(n)}catch(s){return}n.callback||"number"==typeof n.id&&"function"==typeof t[n.method]&&(o=e._responseCallbacks(n.id),r=t[n.method].apply(t,n.params.concat(o)),"undefined"!=typeof r&&o[0](r))}},_responseCallbacks:function(t){var e=this.con;return[function(n){e.send(JSON.stringify({id:t,result:n,callback:!0}))},function n(i){e.send(JSON.stringify({id:t,error:n,callback:i}))}]}}),o.id=0,s.aug(o.prototype,a.Emitter,{send:function(t,e,n){return t.send(JSON.stringify({id:this.id,method:e,params:n})),this},success:function(t){return this.bind("success",t),this},error:function(t){return this.bind("error",t),this}}),e.exports=function(t){return new r(t)}},{63:63,79:79}],90:[function(t,e,n){function i(){}function r(t){this.transportMethod="PostMessage",this.options=t,this._createChild()}function o(t){this.transportMethod="Flash",this.options=t,this.token=Math.random().toString(16).substring(2),this._setup()}function s(t){this.transportMethod="Fallback",this.options=t,this._createChild()}var a,c=t(13),u=t(16),l=t(87),d=t(79),h=t(62),f=t(25),p="__ready__",m=0;i.prototype=new l.Connection,d.aug(i.prototype,{_createChild:function(){this.options.window?this._createWindow():this._createIframe()},_createIframe:function(){function t(){o.child=e.contentWindow,o._ready||o.init()}var e,n,i,r,o=this,s={allowTransparency:!0,frameBorder:"0",scrolling:"no",tabIndex:"0",name:this._name()},l=d.aug(d.aug({},s),this.options.iframe);u.postMessage?(a||(a=c.createElement("iframe")),e=a.cloneNode(!1)):e=c.createElement('<iframe name="'+l.name+'">'),e.id=l.name,d.forIn(l,function(t,n){"style"!=t&&e.setAttribute(t,n)}),r=e.getAttribute("style"),r&&"undefined"!=typeof r.cssText?r.cssText=l.style:e.style.cssText=l.style,e.addEventListener("load",t,!1),e.src=this._source(),(n=this.options.appendTo)?n.appendChild(e):(i=this.options.replace)?(n=i.parentNode,n&&n.replaceChild(e,i)):c.body.insertBefore(e,c.body.firstChild)},_createWindow:function(){var t=f.open(this._source()).popup;t&&t.focus(),this.child=t,this.init()},_source:function(){return this.options.src},_name:function(){var t="_xd_"+m++;return u.parent&&u.parent!=u&&u.name&&(t=u.name+t),t}}),r.prototype=new i,d.aug(r.prototype,{init:function(){function t(t){t.source===e.child&&(e._ready||t.data!==p?e.receive(t.data):e.ready())}var e=this;u.addEventListener("message",t,!1)},_performSend:function(t){this.child.postMessage(t,this.options.src)}}),o.prototype=new i,d.aug(o.prototype,{_setup:function(){var e=this,n=t(88);u["__xdcb"+e.token]={receive:function(t){e._ready||t!==p?e.receive(t):e.ready()},loaded:function(){}};var i=c.createElement("div");i.innerHTML=n.object("https://platform.twitter.com/xd/ft.swf?&token="+e.token+"&parent=true&callback=__xdcb"+e.token+"&xdomain="+e._host(),e.token),c.body.insertBefore(i,c.body.firstChild),e.proxy=i.firstChild,e._createChild()},init:function(){},_performSend:function(t){this.proxy.send(t)},_host:function(){return this.options.src.replace(/https?:\/\//,"").split(/(:|\/)/)[0]},_source:function(){return this.options.src+(this.options.src.match(/\?/)?"&":"?")+"xd_token="+u.escape(this.token)}}),s.prototype=new i,d.aug(s.prototype,{init:function(){},_performSend:function(){}}),e.exports={connect:function(t){return!h.canPostMessage()||h.anyIE()&&t.window?h.anyIE()&&h.flashEnabled()?new o(t):new s(t):new r(t)}}},{13:13,16:16,25:25,62:62,79:79,87:87,88:88}]},{},[86]))}();;