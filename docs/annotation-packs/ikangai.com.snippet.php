<?php
/**
 * Agentic Microformats annotations for ikangai.com (server-side, spec 0.3.0).
 * Adds data-agent-* attributes to the rendered HTML via a front-end output
 * filter. Additive only; no visual change. Delete this snippet to fully revert.
 * Verify with:  npx agentic-microformats https://www.ikangai.com/
 */
add_action('template_redirect', function () {
    if (is_admin() || is_feed() || wp_doing_ajax()) return;
    if (defined('REST_REQUEST') && REST_REQUEST) return;
    ob_start('ikg_agent_annotate');
}, 1);

function ikg_agent_annotate($html) {
    if (!is_string($html) || stripos($html, '</html>') === false) return $html;

    // --- Services: each heading becomes a `service` resource (name + url) ---
    $services = array(
        'AI Workshops'                     => 'ai-workshops',
        'Strategic AI Consultation'        => 'strategic-ai-consultation',
        'AI Tool and Platform Selection'   => 'ai-tool-and-platform-selection',
        'AI Projects'                      => 'ai-projects',
    );
    foreach ($services as $name => $slug) {
        $needle = 'class="ikg-h-fix ikg-h-fix-2">' . $name . '</h2>';
        $repl   = 'class="ikg-h-fix ikg-h-fix-2" data-agent="resource"'
                . ' data-agent-type="service" data-agent-id="' . $slug . '">'
                . '<span data-agent-prop="name">' . $name . '</span>'
                . '<span data-agent-prop="url" data-agent-typehint="url"'
                . ' data-agent-value="/' . $slug . '/" hidden></span></h2>';
        $html = str_replace($needle, $repl, $html);
    }

    // --- Primary contact CTA becomes a declared action ---
    $html = str_replace(
        '<a href="https://www.ikangai.com/contact/">Contact Form',
        '<a href="https://www.ikangai.com/contact/" data-agent="action"'
        . ' data-agent-name="contact" data-agent-method="GET"'
        . ' data-agent-endpoint="/contact/" data-agent-role="primary"'
        . ' data-agent-risk="low" data-agent-reversible="true"'
        . ' data-agent-description="Open the contact form">Contact Form',
        $html
    );

    // --- News cards: each entry-title becomes an `article` resource ---
    $out = preg_replace_callback(
        '#<h3 class="entry-title"><a href="https://www\.ikangai\.com/([a-z0-9-]+)/"([^>]*)>#',
        function ($m) {
            $slug = $m[1];
            return '<h3 class="entry-title" data-agent="resource"'
                . ' data-agent-type="article" data-agent-id="' . $slug . '">'
                . '<span data-agent-prop="url" data-agent-typehint="url"'
                . ' data-agent-value="/' . $slug . '/" hidden></span>'
                . '<a href="https://www.ikangai.com/' . $slug . '/"' . $m[2]
                . ' data-agent-prop="name">';
        },
        $html
    );
    if (is_string($out)) $html = $out; // preg_replace_callback returns null on error

    return $html;
}
