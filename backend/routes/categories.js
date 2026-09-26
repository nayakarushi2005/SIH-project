const express = require('express');
const { listCategories } = require('../services/categories');

const router = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// GET /api/categories?lang=hi&city=Pune&withSynonyms=1
// Public. Active job categories grouped for display, names in `lang`
// (English when unsupported), minus any disabled for `city`.
// ────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await listCategories({
      lang: req.query.lang,
      city: req.query.city,
      withSynonyms: req.query.withSynonyms === '1',
    });
    res.set('Cache-Control', 'public, max-age=3600');
    return res.status(200).json(result);
  } catch (err) {
    console.error('List categories error:', err.message);
    return res.status(500).json({ error: 'Could not load categories.' });
  }
});

module.exports = router;
