<?php

/**
 * @file
 * Default simple view template to display a list of rows.
 *
 * @ingroup views_templates
 */
?>
<?php if (!empty($title)): ?>
  <h3><?php print $title; ?></h3>
<?php endif; ?>
<?php foreach ($rows as $id => $row): ?>
  <div<?php if ($classes_array[$id]) { print ' class="' . $classes_array[$id] .'"';  } ?>>
    <?php $pos = strpos($row, 'field-name-field-blog-tags'); ?>
    <?php $row = substr($row, 0, $pos - 18) . '<span class="glyphicon glyphicon-leaf"></span> ' . substr($row, $pos - 18); ?>
    <?php $pos = strpos($row, 'date-display-single'); ?>
    <?php $row = substr($row, 0, $pos + 21) . '<span class="glyphicon glyphicon-time"></span> ' . substr($row, $pos + 21); ?>
    <?php print $row; ?>
  </div>
<?php endforeach; ?>
</pre>