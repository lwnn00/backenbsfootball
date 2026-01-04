// api/records.js
module.exports = (req, res) => {
  if (req.method === 'POST') {
    res.status(200).json({
      success: true,
      message: 'Record saved via serverless function',
      data: req.body
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};
